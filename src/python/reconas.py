import cv2
import mediapipe as mp
import numpy as np
import time
import json
from deepface import DeepFace

# ---------------- CONFIG ----------------
SMOOTH_FACTOR        = 0.9
OBJETIVO_SEGUNDOS    = 3
MOVIMIENTO_THRESHOLD = 20     # píxeles
FACE_SIZE_THRESHOLD  = 0.8    # 80 % del recuadro
BOX_W, BOX_H         = 250, 300
CAM_INDEX            = 0      # cámara
LOOK_THRESHOLD       = 20     # desplaz. nariz para detectar mirada

# Estados de la secuencia: mirar izquierda, luego derecha
EST_INIT  = 0
EST_LEFT  = 1
EST_RIGHT = 2
EST_DONE  = 3

# ---------------- UTILIDADES ----------------
def normalize(vec):
    vec = np.asarray(vec)
    norm = np.linalg.norm(vec)
    return vec if norm == 0 else vec / norm

def crop_face(frame, lm, pad=20):
    h, w, _ = frame.shape
    x0, y0 = np.min(lm[:, :2], axis=0).astype(int)
    x1, y1 = np.max(lm[:, :2], axis=0).astype(int)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(w, x1 + pad), min(h, y1 + pad)
    return frame[y0:y1, x0:x1]

# Detecta mirada: 'left', 'right' o 'center'
def detectar_mirada(lm, w, h):
    # Usa landmarks 1=nose_tip, 33=left_eye, 263=right_eye
    nose   = np.array([lm[1].x * w, lm[1].y * h])
    left   = np.array([lm[33].x * w, lm[33].y * h])
    right  = np.array([lm[263].x * w, lm[263].y * h])
    center = (left + right) / 2.0
    dx = nose[0] - center[0]
    if dx < -LOOK_THRESHOLD:
        return 'left'
    elif dx > LOOK_THRESHOLD:
        return 'right'
    return 'center'

# ---------------- PROCESO PRINCIPAL ----------------
def main():
    mp_mesh = mp.solutions.face_mesh
    cap     = cv2.VideoCapture(CAM_INDEX)
    cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)

    # inicializar FaceMesh
    with mp_mesh.FaceMesh(
        static_image_mode=False,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5
    ) as mesh:

        smooth      = None
        centro_prev = None
        tiempo_estab = 0.0
        t_prev      = time.time()
        estado      = EST_INIT

        while True:
            ok, frame = cap.read()
            if not ok:
                break
            t_now = time.time()
            dt    = t_now - t_prev
            t_prev = t_now

            h, w, _ = frame.shape
            cx, cy  = w//2, h//2
            tl      = (cx-BOX_W//2, cy-BOX_H//2)
            br      = (cx+BOX_W//2, cy+BOX_H//2)
            cv2.rectangle(frame, tl, br, (255,0,0), 2)

            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = mesh.process(rgb)
            msg = "Mantén cara estable y sigue la secuencia"

            if res.multi_face_landmarks:
                lm = res.multi_face_landmarks[0].landmark
                cur = np.array([(p.x*w, p.y*h, p.z) for p in lm])
                smooth = cur if smooth is None else SMOOTH_FACTOR * smooth + (1-SMOOTH_FACTOR) * cur

                # Bounding box landmarks y movimiento
                x0, y0 = np.min(smooth[:,:2], axis=0)
                x1, y1 = np.max(smooth[:,:2], axis=0)
                area_f = (x1-x0)*(y1-y0)
                area_r = BOX_W*BOX_H
                in_box = x0>=tl[0] and y0>=tl[1] and x1<=br[0] and y1<=br[1]
                centro = np.mean(smooth[:,:2], axis=0)
                move_ok = True
                if centro_prev is not None:
                    move_ok = np.linalg.norm(centro-centro_prev) < MOVIMIENTO_THRESHOLD
                centro_prev = centro
                stable = in_box and move_ok and (area_f/area_r)>=FACE_SIZE_THRESHOLD

                # Detectar mirada
                gaze = detectar_mirada(lm, w, h)
                # Máquina de estados: INIT→LEFT→RIGHT→DONE
                if estado==EST_INIT and gaze=='left':
                    estado = EST_LEFT
                elif estado==EST_LEFT and gaze=='right':
                    estado = EST_RIGHT
                    tiempo_estab = 0.0

                # Si secuencia completada y cara estable, contar tiempo
                if estado==EST_RIGHT and stable:
                    tiempo_estab += dt
                    msg = f"Mantén posición para capturar: {OBJETIVO_SEGUNDOS-tiempo_estab:.1f}s"
                    if tiempo_estab>=OBJETIVO_SEGUNDOS:
                        face = crop_face(frame, smooth)
                        try:
                            df = DeepFace.represent(img_path=face,
                                                     model_name="Facenet",
                                                     enforce_detection=False)
                            emb = normalize(df[0]["embedding"]).tolist()
                            print(json.dumps({"embedding":emb}))
                        except Exception as e:
                            print(json.dumps({"error":str(e)}))
                        break
                else:
                    msg = f"Seguimiento: INIT→LEFT→RIGHT  Estado={estado} Mirada={gaze}"
            else:
                smooth = None
                centro_prev = None
                tiempo_estab = 0.0
                msg = "No se detectó rostro"

            cv2.putText(frame, msg, (10,30), cv2.FONT_HERSHEY_SIMPLEX,0.7,(0,255,255),2)
            cv2.imshow("Secuencia Izq->Der", frame)
            if cv2.waitKey(1)&0xFF==ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()

if __name__=="__main__":
    main()