import cv2
import mediapipe as mp
import numpy as np
import json
import time
import os
from scipy.spatial import distance as dist
from deepface import DeepFace

# --------------------------
# CONFIGURACIÓN
# --------------------------
BASE_DATOS = "usuarios_facenet.json"  # Archivo JSON con usuarios (ahora con embeddings de FaceNet)
SMOOTH_FACTOR = 0.9

# Parámetros para conteo de parpadeos
UMBRAL_EAR = 0.21
FRAMES_CONSECUTIVOS = 3
contador_pestaneos = 0
frames_contados = 0

# Parámetros para comparación de embeddings de FaceNet
# Umbral de reconocimiento: ajustar según pruebas (usualmente entre 8 y 12)
UMBRAL_RECONOCIMIENTO = 10  

# Dimensiones del recuadro y factor de tamaño de la cara
AREA_RECUADRO = 150  # El recuadro mide 2*AREA_RECUADRO en ancho y alto
FACE_SIZE_FACTOR = 0.8

# Parámetros de la “ola” (efecto visual)
waveCenter = None  # Se inicializa en el loop
wave_speed = 20    # píxeles por frame
waveRadius = 150   # ancho de la ola
highlight_color = (255, 255, 255)  # color blanco
color_neon = (57, 255, 20)           # verde neón
alpha = 0.3

# Landmarks relevantes de Face Mesh (para parpadeos y detección de mirada)
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]
NOSE_TIP = 4
LOOK_THRESHOLD = 20  # Para detectar si se mira a la izquierda o derecha

# Máquina de estados para guiar al usuario
ESTADO_INICIAL = 0    # "Alinea tu cara"
# Variables para mostrar el mensaje sobre la cabeza de forma temporal
dibujar_mensaje = None
mensaje_activo_hasta = 0.0
ESTADO_MIRAR_IZQ = 1   # "Mira a la izquierda"
ESTADO_MIRAR_DER = 2   # "Mira a la derecha"
ESTADO_COMPLETADO = 3  # "Proceso completado"
estado = ESTADO_INICIAL

# Variable para suavizar los landmarks
landmarks_suavizados = None

mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils

# --------------------------
# FUNCIONES DE UTILIDAD
# --------------------------
def improve_lighting(img_bgr,
                     clip_limit=2.0,
                     tile_grid=(8, 8),
                     target_mean=0.5): 
    # 1) CLAHE en canal L de LAB
    lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
    l, a, b = cv2.split(lab)
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid)
    l = clahe.apply(l)
    lab = cv2.merge((l, a, b))
    img_eq = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)

    # 2) Gamma dinámico para fijar brillo medio
    gray = cv2.cvtColor(img_eq, cv2.COLOR_BGR2GRAY)
    mean = np.mean(gray) / 255.0 + 1e-6          # evita div/0
    gamma = np.log(target_mean) / np.log(mean)   # >1 oscurece, <1 aclara

    lut = np.array([(i / 255.0) ** gamma * 255
                    for i in range(256)]).astype("uint8")
    img_out = cv2.LUT(img_eq, lut)

    return img_out

def normalize_embedding(emb):
    """
    Recibe un iterable numérico (lista o array), lo convierte en np.array
    y lo divide entre su norma L2.
    """
    arr = np.array(emb, dtype=np.float32)
    norm = np.linalg.norm(arr)
    return arr / norm if norm > 0 else arr

def normalizar_landmarks(landmarks):
    """
    Centra y escala los landmarks (array de forma (N,2) o (N,3)) para que tengan media=0 y desvío=1.
    """
    arr = np.array(landmarks, dtype=np.float32)
    centro = np.mean(arr, axis=0)
    arr -= centro
    desv = np.std(arr)
    if desv > 0:
        arr /= desv
    return arr

def cargar_usuarios():
    """
    Carga la lista de usuarios (embeddings) desde BASE_DATOS.
    """
    if not os.path.exists(BASE_DATOS):
        return []
    with open(BASE_DATOS, "r", encoding="utf-8") as f:
        return json.load(f)

def crop_face_from_frame(frame, landmarks, box_padding=20):
    """
    Dado un frame y los landmarks (array), recorta la región del rostro agregando un padding.
    """
    h, w, _ = frame.shape
    x_min, y_min = np.min(landmarks[:, :2], axis=0).astype(int)
    x_max, y_max = np.max(landmarks[:, :2], axis=0).astype(int)
    x_min = max(0, x_min - box_padding)
    y_min = max(0, y_min - box_padding)
    x_max = min(w, x_max + box_padding)
    y_max = min(h, y_max + box_padding)
    return frame[y_min:y_max, x_min:x_max]

# --------------------------
# RECONOCIMIENTO FACIAL CON FACENET
# --------------------------
def reconocer_facenet(rostro_img):
    """
    Recibe la imagen recortada del rostro actual (rostro_img) y extrae su embedding usando FaceNet a través de DeepFace.
    Compara dicho embedding con los embeddings guardados en BASE_DATOS.
    Retorna (nombre_usuario, distancia_minima) o (None, distancia) si no se reconoce.
    """
    usuarios = cargar_usuarios()
    if len(usuarios) == 0:
        print("No hay usuarios registrados en la base de datos.")
        return None, None

    try:
        resultado = DeepFace.represent(
            img_path=rostro_img,
            model_name="Facenet",
            enforce_detection=False
        )
    except Exception as e:
        print("Error al extraer el embedding:", e)
        return None, None

    embedding_actual = np.array(resultado[0]["embedding"])
    mejor_distancia = float("inf")
    mejor_usuario = None

    for usuario in usuarios:
        emb_guardado = np.array(usuario["embedding_facial"])
        distancia = np.linalg.norm(embedding_actual - emb_guardado)
        if distancia < mejor_distancia:
            mejor_distancia = distancia
            mejor_usuario = usuario["nombre"]

    if mejor_distancia < UMBRAL_RECONOCIMIENTO:
        return mejor_usuario, mejor_distancia
    else:
        return None, mejor_distancia

# --------------------------
# FUNCIONES AUXILIARES (EAR, detección de mirada, etc.)
# --------------------------
def calcular_EAR(coords):
    """
    Calcula el Eye Aspect Ratio (EAR) a partir de 6 puntos (x, y) del ojo.
    """
    vert_1 = dist.euclidean(coords[1], coords[5])
    vert_2 = dist.euclidean(coords[2], coords[4])
    horiz  = dist.euclidean(coords[0], coords[3])
    return (vert_1 + vert_2) / (2.0 * horiz)

def promedio_landmarks(landmarks, indices):
    """
    Retorna el promedio (x, y) de los landmarks indicados.
    """
    pts = landmarks[indices]
    return np.mean(pts, axis=0)

def detectar_mirada(landmarks):
    """
    Determina si el usuario mira a la izquierda, derecha o centro,
    comparando la posición de la nariz con el centro de los ojos.
    """
    left_eye_center = promedio_landmarks(landmarks, LEFT_EYE)
    right_eye_center = promedio_landmarks(landmarks, RIGHT_EYE)
    eyes_center = (left_eye_center + right_eye_center) / 2.0
    nose = landmarks[NOSE_TIP]
    diff_x = nose[0] - eyes_center[0]
    if diff_x < -LOOK_THRESHOLD:
        return 'left'
    elif diff_x > LOOK_THRESHOLD:
        return 'right'
    else:
        return 'center'

# --------------------------
# PROCESO PRINCIPAL
# --------------------------
import sys, json

def enviar_embedding_a_electron(embedding_vector):
    # 1) envía el embedding por stdout
    print(json.dumps({"embedding": embedding_vector}), flush=True)
    # 2) lee la respuesta de Electron por stdin
    line = sys.stdin.readline().strip()
    if not line:
        return None, None
    data = json.loads(line)
    return data.get("nombre"), data.get("mensaje")


mensaje_actual = None
mensaje_color = (0, 255, 0)
mensaje_tiempo_inicio = 0
MENSAJE_DURACION = 2  # segundos que quieres mostrar el mensaje

def main():
    global estado, waveCenter, landmarks_suavizados, contador_pestaneos, frames_contados
    global mensaje_actual, mensaje_color, mensaje_tiempo_inicio

    cap = cv2.VideoCapture(0)  # Ajusta a tu cámara (0 o 1)
    

    waveCenter = None

    with mp_face_mesh.FaceMesh(
        refine_landmarks=True,
        min_detection_confidence=0.7,
        min_tracking_confidence=0.7
    ) as face_mesh:
        while True:
            success, frame = cap.read()
            frame = cv2.flip(frame, 1)
            if not success:
                break

            h, w = frame.shape[:2]
            centro_x, centro_y = w // 2, h // 2

            if waveCenter is None:
                waveCenter = w

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = face_mesh.process(frame_rgb)
            overlay = np.zeros_like(frame)
            recuadro_color = (0, 0, 255)  # rojo por defecto

            if results.multi_face_landmarks:
                f_land = results.multi_face_landmarks[0]
                lms = np.array([(lm.x * w, lm.y * h, lm.z) for lm in f_land.landmark])
                if landmarks_suavizados is None:
                    landmarks_suavizados = lms
                else:
                    landmarks_suavizados = SMOOTH_FACTOR * landmarks_suavizados + (1 - SMOOTH_FACTOR) * lms

                # Calcular centroide y dimensiones de la cara
                cara_x = int(np.mean(landmarks_suavizados[:, 0]))
                cara_y = int(np.mean(landmarks_suavizados[:, 1]))
                dist_centro = np.linalg.norm(np.array([cara_x, cara_y]) - np.array([centro_x, centro_y]))
                x_min, y_min = np.min(landmarks_suavizados[:, :2], axis=0)
                x_max, y_max = np.max(landmarks_suavizados[:, :2], axis=0)
                face_w = x_max - x_min
                face_h = y_max - y_min
                rec_w = 2 * AREA_RECUADRO
                face_big_enough = (face_w >= rec_w * FACE_SIZE_FACTOR or face_h >= rec_w * FACE_SIZE_FACTOR)

                if dist_centro < AREA_RECUADRO and face_big_enough:
                    recuadro_color = (0, 255, 0)  # verde

                    # Calcular EAR para parpadeo
                    ear_izq = calcular_EAR(landmarks_suavizados[LEFT_EYE][:, :2])
                    ear_der = calcular_EAR(landmarks_suavizados[RIGHT_EYE][:, :2])
                    ear_avg = (ear_izq + ear_der) / 2.0

                    if ear_avg < UMBRAL_EAR:
                        frames_contados += 1
                    else:
                        if frames_contados >= FRAMES_CONSECUTIVOS:
                            contador_pestaneos += 1
                        frames_contados = 0

                    # Dibujar la malla con efecto "ola"
                    for connection in mp_face_mesh.FACEMESH_TESSELATION:
                        pt1 = tuple(landmarks_suavizados[connection[0]][:2].astype(int))
                        pt2 = tuple(landmarks_suavizados[connection[1]][:2].astype(int))
                        mid_x = (pt1[0] + pt2[0]) / 2.0
                        distance_wave = abs(mid_x - waveCenter)
                        if distance_wave < waveRadius:
                            factor = 1.0 - (distance_wave / waveRadius)
                            line_color = tuple([
                                int(color_neon[i] + factor * (highlight_color[i] - color_neon[i]))
                                for i in range(3)
                            ])
                        else:
                            line_color = color_neon
                        cv2.line(overlay, pt1, pt2, line_color, 1)

                    # Máquina de estados para instrucciones
                    if estado == ESTADO_INICIAL:
                        estado = ESTADO_MIRAR_IZQ
                    elif estado == ESTADO_MIRAR_IZQ:
                        if detectar_mirada(landmarks_suavizados) == 'left':
                            estado = ESTADO_MIRAR_DER
                    elif estado == ESTADO_MIRAR_DER:
                        if detectar_mirada(landmarks_suavizados) == 'right':
                            estado = ESTADO_COMPLETADO
                else:
                    frames_contados = 0
                    estado = ESTADO_INICIAL
            else:
                frames_contados = 0
                estado = ESTADO_INICIAL

            # Mover la "ola" de derecha a izquierda
            waveCenter -= wave_speed
            if waveCenter < -waveRadius:
                waveCenter = w

            frame_final = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)
            cv2.rectangle(frame_final,
                          (centro_x - AREA_RECUADRO, centro_y - AREA_RECUADRO),
                          (centro_x + AREA_RECUADRO, centro_y + AREA_RECUADRO),
                          recuadro_color, 2)

            # Mostrar instrucciones según el estado
            if estado == ESTADO_INICIAL:
                cv2.putText(frame_final, "Por favor, alinea tu cara", (30, 100),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            elif estado == ESTADO_MIRAR_IZQ:
                cv2.putText(frame_final, "Mira a la IZQUIERDA", (30, 100),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            elif estado == ESTADO_MIRAR_DER:
                cv2.putText(frame_final, "Mira a la DERECHA", (30, 100),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
            if estado == ESTADO_COMPLETADO:
                cv2.putText(frame_final, f'Pestañeos: {contador_pestaneos}', (30, 50),
                        cv2.FONT_HERSHEY_SIMPLEX, 1, (255, 255, 255), 2)
                ear_izq = calcular_EAR(landmarks_suavizados[LEFT_EYE][:, :2])
                ear_der = calcular_EAR(landmarks_suavizados[RIGHT_EYE][:, :2])
                ear_avg = (ear_izq + ear_der) / 2.0

                if ear_avg < UMBRAL_EAR:
                    frames_contados += 1
                    
                else:
                    if frames_contados >= FRAMES_CONSECUTIVOS:
                        contador_pestaneos += 1
                        
                    frames_contados = 0
            else:
                # Si no está en estado COMPLETADO, resetea los contadores
                frames_contados = 0
                contador_pestaneos = 0
            

            # Cuando se han contado 5 parpadeos, se intenta reconocer al usuario mediante FaceNet
            if contador_pestaneos >= 5 and landmarks_suavizados is not None:
                # 1) Recorta la cara
                rostro_recortado = crop_face_from_frame(frame, landmarks_suavizados)
                rostro_recortado = improve_lighting(rostro_recortado) 
                # 2) Extrae el embedding en vivo
                resultado = DeepFace.represent(
                    img_path=rostro_recortado,
                    model_name="Facenet",
                    enforce_detection=False
                )
                embedding = resultado[0]["embedding"]
                embedding_norm = normalize_embedding(embedding)

                nombre, mensaje = enviar_embedding_a_electron(embedding_norm.tolist())
                mensaje_actual = mensaje
                mensaje_color = (0, 255, 0) if nombre else (0, 0, 255)
                mensaje_tiempo_inicio = time.time()
                contador_pestaneos = 0
                # Si hay mensaje y no ha pasado el tiempo, dibuja el mensaje
                if mensaje_actual:
                    if time.time() - mensaje_tiempo_inicio < MENSAJE_DURACION:
                        cabeza_x = int(np.mean(landmarks_suavizados[:, 0]))
                        cabeza_y = int(np.min(landmarks_suavizados[:, 1])) - 20
                        cv2.putText(frame_final, mensaje_actual, (cabeza_x - 100, cabeza_y),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, mensaje_color, 2)
                    else:
                        mensaje_actual = None  # Elimina el mensaje cuando pasa el tiempo


                # 5) Reinicia el contador para seguir reconociendo
                contador_pestaneos = 0


            cv2.imshow("Secuencia: Alinear -> Izq -> Der", frame_final)
            if cv2.waitKey(5) & 0xFF == ord('q'):
                break

        cap.release()
        cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
