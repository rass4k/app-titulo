import cv2
import mediapipe as mp
import numpy as np
from scipy.spatial import distance as dist

mp_face_mesh = mp.solutions.face_mesh
mp_drawing = mp.solutions.drawing_utils

# Color base (B, G, R) y transparencia
color_neon = (57, 255, 20)  # Verde neón
alpha = 0.3

# Landmarks de los ojos (Mediapipe FaceMesh)
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]
NOSE_TIP = 4  # Landmark de la punta de la nariz (en Face Mesh)

# Parámetros para conteo de pestañeos
UMBRAL_EAR = 0.21
FRAMES_CONSECUTIVOS = 3

# Dimensión del recuadro estático (para centrar el rostro)
AREA_RECUADRO = 150  # radio; el recuadro mide 2*AREA_RECUADRO en ancho y alto

# Variables para el conteo de pestañeos
contador_pestaneos = 0
frames_contados = 0

# Parámetros de la “ola” (efecto color intensificado)
waveCenter = None     # posición horizontal de la ola
wave_speed = 20       # velocidad de la ola (pixeles por frame)
waveRadius = 150      # ancho de la ola
highlight_color = (255, 255, 255)  # color al que tiende la línea (blanco)

# Suavizado exponencial de landmarks (reduce "tiritado")
SMOOTH_FACTOR = 0.9
landmarks_suavizados = None

# Factor para exigir que la cara sea al menos un porcentaje del recuadro
FACE_SIZE_FACTOR = 0.8

# Umbral en pixeles para considerar que se mira a izq/der
LOOK_THRESHOLD = 20

# --------------------------
# MAQUINA DE ESTADOS (alinear -> izq -> der -> completado)
# --------------------------
ESTADO_INICIAL = 0    # "Alinea tu cara"
ESTADO_MIRAR_IZQ = 1   # "Mira a la izquierda"
ESTADO_MIRAR_DER = 2   # "Mira a la derecha"
ESTADO_COMPLETADO = 3  # "Proceso completado"

estado = ESTADO_INICIAL

def calcular_EAR(coords):
    """
    coords: array con 6 puntos del ojo [x,y].
    Calcula el Eye Aspect Ratio (EAR).
    """
    vert_1 = dist.euclidean(coords[1], coords[5])
    vert_2 = dist.euclidean(coords[2], coords[4])
    horiz = dist.euclidean(coords[0], coords[3])
    return (vert_1 + vert_2) / (2.0 * horiz)

def promedio_landmarks(landmarks, indices):
    """
    Retorna el (x, y) promedio de los landmarks especificados en 'indices'.
    """
    pts = landmarks[indices]
    return np.mean(pts, axis=0)  # (x_mean, y_mean)

def detectar_mirada(landmarks):
    """
    Determina si el usuario mira a la izquierda, derecha o al frente,
    comparando la posición de la nariz con el centro de los ojos.
    Retorna 'left', 'right' o 'center'.
    """
    # Centro del ojo izquierdo y derecho
    left_eye_center = promedio_landmarks(landmarks, LEFT_EYE)
    right_eye_center = promedio_landmarks(landmarks, RIGHT_EYE)
    eyes_center = (left_eye_center + right_eye_center) / 2.0

    # Nariz
    nose = landmarks[NOSE_TIP]

    # Diferencia en X
    diff_x = nose[0] - eyes_center[0]

    if diff_x < -LOOK_THRESHOLD:
        return 'left'
    elif diff_x > LOOK_THRESHOLD:
        return 'right'
    else:
        return 'center'

cap = cv2.VideoCapture(1)

with mp_face_mesh.FaceMesh(
    refine_landmarks=True,
    min_detection_confidence=0.7,
    min_tracking_confidence=0.7
) as face_mesh:

    while cap.isOpened():
        success, frame = cap.read()
        if not success:
            break

        h, w = frame.shape[:2]
        centro_x, centro_y = w // 2, h // 2

        # Iniciar ola en el extremo derecho si no está definida
        if waveCenter is None:
            waveCenter = w

        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        results = face_mesh.process(frame_rgb)

        # Overlay transparente donde dibujaremos la malla
        overlay = np.zeros_like(frame)

        # Por defecto, recuadro rojo (desalineado o lejos)
        recuadro_color = (0, 0, 255)

        if results.multi_face_landmarks:
            face_landmarks = results.multi_face_landmarks[0]

            # Landmarks en (x, y) a píxeles
            landmarks_actuales = np.array([
                (lm.x * w, lm.y * h) for lm in face_landmarks.landmark
            ])

            # Suavizado exponencial
            if landmarks_suavizados is None:
                landmarks_suavizados = landmarks_actuales
            else:
                landmarks_suavizados = (
                    SMOOTH_FACTOR * landmarks_suavizados +
                    (1 - SMOOTH_FACTOR) * landmarks_actuales
                )

            # Centroide de la cara
            cara_x = int(np.mean(landmarks_suavizados[:, 0]))
            cara_y = int(np.mean(landmarks_suavizados[:, 1]))

            # Distancia del centro de la cara al centro del frame (alineación)
            distancia_centro = dist.euclidean((cara_x, cara_y), (centro_x, centro_y))

            # Bounding box de la cara
            x_min, y_min = np.min(landmarks_suavizados, axis=0)
            x_max, y_max = np.max(landmarks_suavizados, axis=0)
            face_width = x_max - x_min
            face_height = y_max - y_min

            # El recuadro mide 2*AREA_RECUADRO en cada lado
            recuadro_ancho = 2 * AREA_RECUADRO

            # Comprobamos si la cara es >= FACE_SIZE_FACTOR * recuadro
            face_big_enough = (
                face_width >= recuadro_ancho * FACE_SIZE_FACTOR or
                face_height >= recuadro_ancho * FACE_SIZE_FACTOR
            )

            # Verificar alineación y tamaño
            if distancia_centro < AREA_RECUADRO and face_big_enough:
                recuadro_color = (0, 255, 0)  # verde

                # EAR con la malla suavizada
                ear_izq = calcular_EAR(landmarks_suavizados[LEFT_EYE])
                ear_der = calcular_EAR(landmarks_suavizados[RIGHT_EYE])
                ear_avg = (ear_izq + ear_der) / 2.0

                # Conteo de pestañeos
                if ear_avg < UMBRAL_EAR:
                    frames_contados += 1
                else:
                    if frames_contados >= FRAMES_CONSECUTIVOS:
                        contador_pestaneos += 1
                    frames_contados = 0

                # Dibujamos la malla + ola
                for connection in mp_face_mesh.FACEMESH_TESSELATION:
                    pt1 = tuple(landmarks_suavizados[connection[0]].astype(int))
                    pt2 = tuple(landmarks_suavizados[connection[1]].astype(int))

                    # Punto medio en X
                    mid_x = (pt1[0] + pt2[0]) / 2.0
                    distance_wave = abs(mid_x - waveCenter)

                    # Intensificar color si está dentro de la ola
                    if distance_wave < waveRadius:
                        factor = 1.0 - (distance_wave / waveRadius)
                        line_color = tuple([
                            int(color_neon[i] + factor * (highlight_color[i] - color_neon[i]))
                            for i in range(3)
                        ])
                    else:
                        line_color = color_neon

                    cv2.line(overlay, pt1, pt2, line_color, 1)

                # -----------
                # LÓGICA DE ESTADOS (alinear -> izq -> der -> completado)
                # -----------
                if estado == ESTADO_INICIAL:
                    # Ya estamos alineados, pasamos a pedir "Mira a la izquierda"
                    estado = ESTADO_MIRAR_IZQ

                elif estado == ESTADO_MIRAR_IZQ:
                    # Detectar si el usuario mira a la izquierda
                    mirada = detectar_mirada(landmarks_suavizados)
                    if mirada == 'left':
                        estado = ESTADO_MIRAR_DER

                elif estado == ESTADO_MIRAR_DER:
                    # Detectar si el usuario mira a la derecha
                    mirada = detectar_mirada(landmarks_suavizados)
                    if mirada == 'right':
                        estado = ESTADO_COMPLETADO

            else:
                # Cara pequeña o desalineada -> recuadro rojo
                frames_contados = 0
                # Si se pierde la alineación, volvemos al estado inicial
                estado = ESTADO_INICIAL

        else:
            # No se detecta cara
            frames_contados = 0
            estado = ESTADO_INICIAL

        # Mover la ola solo de derecha a izquierda
        waveCenter -= wave_speed
        if waveCenter < -waveRadius:
            waveCenter = w

        # Superponemos overlay con la imagen original
        frame_final = cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0)

        # Dibujar recuadro
        cv2.rectangle(
            frame_final,
            (centro_x - AREA_RECUADRO, centro_y - AREA_RECUADRO),
            (centro_x + AREA_RECUADRO, centro_y + AREA_RECUADRO),
            recuadro_color, 2
        )

        # ----------------------
        # Mensajes en pantalla
        # ----------------------
        if estado == ESTADO_INICIAL:
            cv2.putText(frame_final, "Por favor, alinea tu cara", (30, 100),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        elif estado == ESTADO_MIRAR_IZQ:
            cv2.putText(frame_final, "Mira a la IZQUIERDA", (30, 100),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        elif estado == ESTADO_MIRAR_DER:
            cv2.putText(frame_final, "Mira a la DERECHA", (30, 100),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        elif estado == ESTADO_COMPLETADO:
            cv2.putText(frame_final, "Proceso completado!", (30, 100),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

        # Mostrar contador de pestañeos
        cv2.putText(frame_final, f'Pestaneos: {contador_pestaneos}',
                    (30, 50), cv2.FONT_HERSHEY_SIMPLEX,
                    1, (255, 255, 255), 2)

        cv2.imshow('Secuencia: Alinear -> Izq -> Der', frame_final)

        if cv2.waitKey(5) & 0xFF == ord('q'):
            break

cap.release()
cv2.destroyAllWindows()
