#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
registerv2.py  –  Captura un embedding FaceNet en vivo y lo devuelve en JSON.
Imprime:   {"embedding":[0.12, -0.98, … ]}
No solicita datos y no guarda archivos locales.
"""

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
CAM_INDEX            = 0      # cambia si usas otra cámara

# -------------- UTILIDADES --------------
def normalize(vec):
    vec = np.asarray(vec)
    n   = np.linalg.norm(vec)
    return vec if n == 0 else vec / n

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

def crop_face(frame, lm, pad=20):
    h, w, _ = frame.shape
    x0, y0 = np.min(lm[:, :2], axis=0).astype(int)
    x1, y1 = np.max(lm[:, :2], axis=0).astype(int)
    x0, y0 = max(0, x0 - pad), max(0, y0 - pad)
    x1, y1 = min(w, x1 + pad), min(h, y1 + pad)
    return frame[y0:y1, x0:x1]

# -------------- PRINCIPAL --------------
def main():
    mp_mesh = mp.solutions.face_mesh
    cap     = cv2.VideoCapture(CAM_INDEX)

    with mp_mesh.FaceMesh(static_image_mode=False,
                          max_num_faces=1,
                          refine_landmarks=True,
                          min_detection_confidence=0.5,
                          min_tracking_confidence=0.5) as mesh:

        smooth        = None
        centro_prev   = None
        tiempo_estab  = 0.0
        t_prev        = time.time()

        while cap.isOpened():
            ok, frame = cap.read()
            if not ok:
                break

            dt, t_prev = time.time() - t_prev, time.time()
            h, w, _    = frame.shape
            cx, cy     = w // 2, h // 2
            tl, br     = (cx - BOX_W // 2, cy - BOX_H // 2), (cx + BOX_W // 2, cy + BOX_H // 2)
            cv2.rectangle(frame, tl, br, (255, 0, 0), 2)

            res = mesh.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
            msg, estable = "No se detectó rostro.", False

            if res.multi_face_landmarks:
                cur = np.array([(p.x * w, p.y * h, p.z) for p in res.multi_face_landmarks[0].landmark])
                smooth = cur if smooth is None else SMOOTH_FACTOR * smooth + (1 - SMOOTH_FACTOR) * cur

                x0, y0 = np.min(smooth[:, :2], 0)
                x1, y1 = np.max(smooth[:, :2], 0)
                area_f = (x1 - x0) * (y1 - y0)
                area_r = BOX_W * BOX_H

                in_box     = x0 >= tl[0] and y0 >= tl[1] and x1 <= br[0] and y1 <= br[1]
                big_enough = (area_f / area_r) >= FACE_SIZE_THRESHOLD

                centro   = np.mean(smooth[:, :2], 0)
                move_ok  = np.linalg.norm(centro - centro_prev) < MOVIMIENTO_THRESHOLD if centro_prev is not None else True
                centro_prev = centro

                estable = in_box and big_enough and move_ok
                if not in_box:        msg = "Ajusta tu rostro al recuadro."
                elif not big_enough:  msg = "Acércate más."
                elif not move_ok:     msg = "Mantente quieto."

            if estable:
                tiempo_estab += dt
                if tiempo_estab >= OBJETIVO_SEGUNDOS:
                    face = crop_face(frame, smooth)
                    face = improve_lighting(face) 
                    try:
                        emb = DeepFace.represent(img_path=face,
                                                 model_name="Facenet",  
                                                 enforce_detection=False)[0]["embedding"]
                    except Exception as e:
                        print(json.dumps({"error": str(e)}))
                        break

                    print(json.dumps({"embedding": normalize(emb).tolist()}))
                    break
                msg = f"Mantén la posición… {OBJETIVO_SEGUNDOS - tiempo_estab:.1f}s"
            else:
                tiempo_estab = 0.0

            cv2.putText(frame, msg, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7,
                        (0, 255, 255), 2)
            cv2.imshow("Captura FaceNet", frame)
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break

    cap.release()
    cv2.destroyAllWindows()

# -------------- EJECUCIÓN ---------------
if __name__ == "__main__":
    main()
