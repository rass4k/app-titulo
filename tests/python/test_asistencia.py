# tests/python/test_asistencia.py
import sys
import os
import json
import pytest
import numpy as np
from io import StringIO
import importlib.util

# Ruta al script original de asistencia
SCRIPT_PATH = os.path.abspath(
    os.path.join(os.path.dirname(__file__), '../../src/python/asistencia.py')
)

# Cargar el módulo dinámicamente
spec = importlib.util.spec_from_file_location('asistencia_mod', SCRIPT_PATH)
asistencia_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(asistencia_mod)

# --------------------------
# Tests de importación y existencia de funciones
# --------------------------

def test_module_importable():
    assert asistencia_mod is not None, "No se pudo importar asistencia.py"


def test_functions_exist():
    expected_funcs = [
        'improve_lighting',
        'normalize_embedding',
        'cargar_usuarios',
        'crop_face_from_frame',
        'calcular_EAR',
        'promedio_landmarks',
        'detectar_mirada',
        'enviar_embedding_a_electron'
    ]
    for func in expected_funcs:
        assert hasattr(asistencia_mod, func), f"Falta la función '{func}' en asistencia.py"

# --------------------------
# Tests de funcionalidad básica
# --------------------------

def test_improve_lighting_preserves_type_and_shape():
    img = np.random.randint(0, 256, (50, 50, 3), dtype=np.uint8)
    out = asistencia_mod.improve_lighting(img, clip_limit=2.0, tile_grid=(8,8), target_mean=0.5)
    assert isinstance(out, np.ndarray)
    assert out.shape == img.shape
    assert out.min() >= 0 and out.max() <= 255


def test_normalize_embedding_zero_and_unit():
    zero = [0, 0, 0]
    out_zero = asistencia_mod.normalize_embedding(zero)
    assert np.allclose(out_zero, np.array(zero, dtype=np.float32))

    vec = [3.0, 4.0]
    out = asistencia_mod.normalize_embedding(vec)
    assert pytest.approx(1.0, rel=1e-6) == np.linalg.norm(out)


def test_cargar_usuarios_empty_and_valid(tmp_path, monkeypatch):
    monkeypatch.setattr(asistencia_mod, 'BASE_DATOS', str(tmp_path / 'no.json'))
    assert asistencia_mod.cargar_usuarios() == []
    data = [{'id':1}, {'id':2}]
    file = tmp_path / 'db.json'
    file.write_text(json.dumps(data), encoding='utf-8')
    monkeypatch.setattr(asistencia_mod, 'BASE_DATOS', str(file))
    assert asistencia_mod.cargar_usuarios() == data


def test_crop_face_from_frame_dimensions():
    frame = np.zeros((100, 80, 3), dtype=np.uint8)
    landmarks = np.array([[10,10,0],[10,20,0],[30,20,0],[30,10,0]])
    cropped = asistencia_mod.crop_face_from_frame(frame, landmarks, box_padding=5)
    assert cropped.shape[1] == (30-10) + 2*5
    assert cropped.shape[0] == (20-10) + 2*5


def test_calcular_EAR_and_promedio_landmarks():
    coords = np.array([[0,0],[0,3],[4,3],[4,0],[0,0],[4,0]])
    ear = asistencia_mod.calcular_EAR(coords)
    assert pytest.approx(1.25, rel=1e-3) == ear
    lm = np.array([[0,0],[2,0],[2,2],[0,2]])
    avg = asistencia_mod.promedio_landmarks(lm, [0,2])
    assert np.allclose(avg, np.array([1,1]))


def test_detectar_mirada():
    # Crear un array de landmarks lo suficientemente grande para cubrir los índices más altos
    max_idx = max(asistencia_mod.LEFT_EYE + asistencia_mod.RIGHT_EYE + [asistencia_mod.NOSE_TIP])
    lm = np.zeros((max_idx + 1, 3))

    # Caso centro
    lm[asistencia_mod.LEFT_EYE, 0] = 30
    lm[asistencia_mod.RIGHT_EYE, 0] = 70
    lm[asistencia_mod.NOSE_TIP, 0] = 50
    assert asistencia_mod.detectar_mirada(lm) == 'center'

    # Caso izquierda
    lm[asistencia_mod.NOSE_TIP, 0] = 10
    assert asistencia_mod.detectar_mirada(lm) == 'left'

    # Caso derecha
    lm[asistencia_mod.NOSE_TIP, 0] = 90
    assert asistencia_mod.detectar_mirada(lm) == 'right'


def test_enviar_embedding_a_electron(monkeypatch):
    response = {'nombre':'User','mensaje':'OK'}
    monkeypatch.setattr(sys, 'stdin', StringIO(json.dumps(response) + ''))
    buf = StringIO()
    monkeypatch.setattr(sys, 'stdout', buf)
    name, msg = asistencia_mod.enviar_embedding_a_electron([1,2,3])
    sent = json.loads(buf.getvalue())
    assert sent['embedding'] == [1,2,3]
    assert name == 'User' and msg == 'OK'

# --------------------------
# Tests de conteo de parpadeos
# --------------------------

@pytest.mark.parametrize("ear_values, expected_blinks", [
    ([asistencia_mod.UMBRAL_EAR + 0.1] * 5, 0),
    ([asistencia_mod.UMBRAL_EAR - 0.1] * (asistencia_mod.FRAMES_CONSECUTIVOS - 1) + [asistencia_mod.UMBRAL_EAR + 0.1], 0),
    ([asistencia_mod.UMBRAL_EAR - 0.1] * asistencia_mod.FRAMES_CONSECUTIVOS + [asistencia_mod.UMBRAL_EAR + 0.1], 1),
    ([asistencia_mod.UMBRAL_EAR - 0.1] * asistencia_mod.FRAMES_CONSECUTIVOS + [asistencia_mod.UMBRAL_EAR + 0.1]
     + [asistencia_mod.UMBRAL_EAR - 0.1] * asistencia_mod.FRAMES_CONSECUTIVOS + [asistencia_mod.UMBRAL_EAR + 0.1], 2)
])
def test_actualizar_conteo_parpadeo(ear_values, expected_blinks):
    if not hasattr(asistencia_mod, 'actualizar_conteo_parpadeo'):
        pytest.skip("actualizar_conteo_parpadeo no implementada en asistencia.py")
    frames_cnt = 0
    blink_cnt = 0
    for ear in ear_values:
        frames_cnt, blink_cnt = asistencia_mod.actualizar_conteo_parpadeo(ear, frames_cnt, blink_cnt)
    assert blink_cnt == expected_blinks
