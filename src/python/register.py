import cv2
import mediapipe as mp
import numpy as np
import time
import os
import json
from deepface import DeepFace

# --------------------------
# CONFIGURACIÓN
# --------------------------
BASE_DATOS = "usuarios_facenet.json"  # Archivo JSON para almacenar embeddings de FaceNet
SMOOTH_FACTOR = 0.9
OBJETIVO_SEGUNDOS = 3         # Se necesitan 3 s estables
MOVIMIENTO_THRESHOLD = 20     # 20 píxeles => movimiento brusco
FACE_SIZE_THRESHOLD = 0.8     # 80% del recuadro
BOX_W, BOX_H = 250, 300       # Tamaño del recuadro guía
CAM_INDEX = 0                 # Índice de la cámara (ajusta a 0 o 1 según corresponda)

# --------------------------
# FUNCIONES
# --------------------------
def normalize(embedding):
    """
    Normaliza un embedding dividiéndolo entre su norma L2.
    """
    embedding = np.array(embedding)
    norma = np.linalg.norm(embedding)
    if norma == 0:
        return embedding
    return embedding / norma

def guardar_usuario_embedding(usuario_id, nombre, embedding):
    """
    Guarda en BASE_DATOS un registro que contiene el ID, nombre y el embedding facial normalizado generado con FaceNet.
    """
    # Verificamos si el embedding es np.array, de ser así lo convertimos a lista
    if isinstance(embedding, np.ndarray):
        embedding = embedding.tolist()

    nuevo_usuario = {
        "id": usuario_id,
        "nombre": nombre,
        "embedding_facial": embedding
    }

    # Leemos los datos existentes
    if os.path.exists(BASE_DATOS):
        with open(BASE_DATOS, "r", encoding="utf-8") as f:
            datos = json.load(f)
    else:
        datos = []

    # Agregamos el nuevo registro
    datos.append(nuevo_usuario)

    # Escribimos de vuelta en el JSON
    with open(BASE_DATOS, "w", encoding="utf-8") as f:
        json.dump(datos, f, indent=4, ensure_ascii=False)

    print(f"✅ Usuario '{nombre}' guardado correctamente en:\n    {os.path.abspath(BASE_DATOS)}")

def crop_face_from_frame(frame, landmarks, box_padding=20):
    """
    Dado un frame y landmarks, calcula el recuadro de la cara y retorna la imagen recortada.
    Se agrega un padding para incluir una zona extra alrededor del rostro.
    """
    h, w, _ = frame.shape
    x_min, y_min = np.min(landmarks[:, :2], axis=0).astype(int)
    x_max, y_max = np.max(landmarks[:, :2], axis=0).astype(int)

    # Se incluye un padding extra (asegurándose que las coordenadas no se salgan de la imagen)
    x_min = max(0, x_min - box_padding)
    y_min = max(0, y_min - box_padding)
    x_max = min(w, x_max + box_padding)
    y_max = min(h, y_max + box_padding)

    return frame[y_min:y_max, x_min:x_max]

def registrar_facenet():
    # Solicitar datos del usuario
    usuario_id = input("Ingrese el ID del usuario: ")
    nombre = input("Ingrese el nombre del usuario: ")

    mp_face_mesh = mp.solutions.face_mesh
    cap = cv2.VideoCapture(1)

    with mp_face_mesh.FaceMesh(
            static_image_mode=False,
            max_num_faces=1,
            refine_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5) as face_mesh:

        landmarks_suavizados = None
        centro_anterior = None

        tiempo_estable_acumulado = 0.0
        ultimo_frame_time = time.time()

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret:
                break

            t_actual = time.time()
            dt = t_actual - ultimo_frame_time
            ultimo_frame_time = t_actual

            h, w, _ = frame.shape
            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(frame_rgb)

            # Dibujar recuadro guía en el centro de la imagen
            cx, cy = w // 2, h // 2
            top_left = (cx - BOX_W // 2, cy - BOX_H // 2)
            bottom_right = (cx + BOX_W // 2, cy + BOX_H // 2)
            cv2.rectangle(frame, top_left, bottom_right, (255, 0, 0), 2)

            rect_area = BOX_W * BOX_H
            mensaje = "No se detectó rostro."
            estable_en_este_frame = False

            if results.multi_face_landmarks:
                face_landmarks = results.multi_face_landmarks[0]

                # Convertir landmarks a píxeles: array (N, 3)
                current_landmarks = np.array([
                    (lm.x * w, lm.y * h, lm.z)
                    for lm in face_landmarks.landmark
                ])

                # Suavizado exponencial para reducir saltos
                if landmarks_suavizados is None:
                    landmarks_suavizados = current_landmarks
                else:
                    landmarks_suavizados = (
                        SMOOTH_FACTOR * landmarks_suavizados +
                        (1 - SMOOTH_FACTOR) * current_landmarks
                    )

                # Opcional: dibujar puntos de la malla facial
                for (px, py, _) in landmarks_suavizados:
                    cv2.circle(frame, (int(px), int(py)), 1, (0, 255, 0), -1)

                # Bounding box basado en los landmarks suavizados
                x_min, y_min = np.min(landmarks_suavizados[:, :2], axis=0)
                x_max, y_max = np.max(landmarks_suavizados[:, :2], axis=0)
                face_area = (x_max - x_min) * (y_max - y_min)

                # 1) La cara debe estar completamente dentro del recuadro
                dentro_del_recuadro = (
                    x_min >= top_left[0] and y_min >= top_left[1] and
                    x_max <= bottom_right[0] and y_max <= bottom_right[1]
                )

                # 2) La cara debe ocupar al menos FACE_SIZE_THRESHOLD del recuadro
                face_vs_rect_ratio = face_area / rect_area if rect_area > 0 else 0
                tamano_suficiente = (face_vs_rect_ratio >= FACE_SIZE_THRESHOLD)

                # 3) Se mide el movimiento del centro de la cara
                centro_actual = np.mean(landmarks_suavizados[:, :2], axis=0)
                if centro_anterior is not None:
                    desplazamiento_centro = np.linalg.norm(centro_actual - centro_anterior)
                else:
                    desplazamiento_centro = 0
                centro_anterior = centro_actual.copy()

                movimiento_minimo = (desplazamiento_centro < MOVIMIENTO_THRESHOLD)

                # Valida que se cumplan las 3 condiciones
                if dentro_del_recuadro and tamano_suficiente and movimiento_minimo:
                    estable_en_este_frame = True

                # Mensajes de ayuda según la condición no cumplida
                if not dentro_del_recuadro:
                    mensaje = "❌ Ajusta tu rostro dentro del recuadro."
                elif not tamano_suficiente:
                    mensaje = (f"❌ Acércate más: tu cara ocupa "
                               f"{face_vs_rect_ratio*100:.1f}% del recuadro.")
                elif not movimiento_minimo:
                    mensaje = f"❌ Movimiento brusco detectado ({desplazamiento_centro:.1f}px)."

            # Conteo de tiempo estable para confirmar registro
            if estable_en_este_frame:
                tiempo_estable_acumulado += dt
                tiempo_restante = OBJETIVO_SEGUNDOS - tiempo_estable_acumulado
                if tiempo_restante > 0:
                    mensaje = f"Mantén la posición... {tiempo_restante:.1f} s"
                else:
                    mensaje = "✅ Registro completado."

                    # Recorte del rostro a partir de los landmarks
                    rostro_recortado = crop_face_from_frame(frame, landmarks_suavizados)
                    # Opcional: se puede guardar la imagen recortada para depuración
                    # cv2.imwrite("rostro_registrado.jpg", rostro_recortado)

                    # Extraer el embedding del rostro usando FaceNet a través de DeepFace
                    try:
                        resultado = DeepFace.represent(img_path=rostro_recortado, model_name="Facenet", enforce_detection=False)
                        embedding = resultado[0]["embedding"]
                    except Exception as e:
                        print("Error al extraer el embedding:", e)
                        break

                    # Normalizar el embedding antes de guardarlo
                    embedding_norm = normalize(embedding)
                    
                    # Guardamos el embedding normalizado en el JSON
                    guardar_usuario_embedding(usuario_id, nombre, embedding_norm)
                    break
            else:
                tiempo_estable_acumulado = 0.0

            # Mostrar mensaje en pantalla
            cv2.putText(frame, mensaje, (10, 30),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
            cv2.imshow("Registro Facial - FaceNet", frame)

            # Salir con 'q'
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

        cap.release()
        cv2.destroyAllWindows()

# --------------------------
# EJECUCIÓN
# --------------------------
if __name__ == "__main__":
    registrar_facenet()
