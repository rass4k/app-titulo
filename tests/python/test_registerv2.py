# tests/python/test_registerv2.py
import sys
import os
import pytest
import numpy as np
import importlib.util
import cv2
from numpy.testing import assert_allclose

# Ruta al script original
SCRIPT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../src/python/registerv2.py'))

# Cargar el módulo dinámicamente
spec = importlib.util.spec_from_file_location('registerv2_mod', SCRIPT_PATH)
registerv2_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(registerv2_mod)


def test_normalize_exists_and_zero_vector():
    assert hasattr(registerv2_mod, 'normalize'), "registerv2.py debe definir normalize"
    out = registerv2_mod.normalize([0, 0, 0])
    assert np.allclose(out, np.array([0, 0, 0])), "normalize([0,0,0]) debe devolver el mismo vector"


def test_normalize_unit_vector():
    v = [3, 4]
    out = registerv2_mod.normalize(v)
    assert np.isclose(np.linalg.norm(out), 1.0), "La norma del vector normalizado debe ser 1"


def test_normalize_dimension_preserved():
    for length in [1, 2, 3, 5, 10]:
        vec = list(range(1, length + 1))
        out = registerv2_mod.normalize(vec)
        assert len(out) == length, f"El vector normalizado debe tener longitud {length}"


def test_normalize_specific_vector():
    vec = [1, 1, 1]
    out = registerv2_mod.normalize(vec)
    expected = np.array(vec) / np.linalg.norm(vec)
    assert np.allclose(out, expected), "normalize([1,1,1]) incorrecto"


def test_normalize_negative_values():
    vec = [-2, 0, 2]
    out = registerv2_mod.normalize(vec)
    expected = np.array(vec) / np.linalg.norm(vec)
    assert np.allclose(out, expected), "normalize con valores negativos incorrecto"


def test_improve_lighting_changes_contrast():
    # Imagen uniforme con valor medio 128
    img = np.full((100, 100, 3), 128, dtype=np.uint8)
    out = registerv2_mod.improve_lighting(img, clip_limit=2.0, tile_grid=(8,8), target_mean=0.3)
    # La media gris de salida debe aproximarse al target_mean*255
    gray_out = cv2.cvtColor(out, cv2.COLOR_BGR2GRAY)
    mean_out = np.mean(gray_out) / 255.0
    assert pytest.approx(0.3, rel=0.1) == mean_out, f"El brillo medio debe acercarse a 0.3, got {mean_out}"


def test_crop_face_dimensions():
    # Frame de 100x100, landmarks en el centro
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    # Landmarks formando un cuadrado de 20x20 en el centro
    lm = np.array([[40,40],[40,60],[60,60],[60,40]])
    cropped = registerv2_mod.crop_face(frame, lm, pad=10)
    # Debe tener tamaño 20+2*pad en ambas dimensiones
    assert cropped.shape[0] == 20 + 2*10
    assert cropped.shape[1] == 20 + 2*10


def test_capturar_embedding_with_mocks(monkeypatch):
    if not hasattr(registerv2_mod, 'capturar_embedding'):
        pytest.skip("capturar_embedding no definido en registerv2.py")
    # Simulación de detección
    class DummyBox:
        def __init__(self):
            self.relative_bounding_box = self
            self.xmin = 0; self.ymin = 0; self.width = 1; self.height = 1
    class DummyDet: location_data = DummyBox()
    class DummyResults: detections = [DummyDet()]
    class DummyFaceDetection:
        def __init__(self, *args, **kwargs): pass
        def process(self, frame): return DummyResults()
        def close(self): pass
    monkeypatch.setattr(registerv2_mod.mp.solutions.face_detection, 'FaceDetection', DummyFaceDetection)
    # Simulación de cámara
    class DummyCap:
        def __init__(self, idx): pass
        def read(self):
            frame = np.zeros((registerv2_mod.BOX_H, registerv2_mod.BOX_W, 3), dtype=np.uint8)
            return True, frame
        def release(self): pass
    monkeypatch.setattr(registerv2_mod.cv2, 'VideoCapture', DummyCap)
    # Simulación DeepFace
    def dummy_represent(img_path=None, model_name=None, enforce_detection=None):
        return [{'embedding': [0, 0, 5]}]
    monkeypatch.setattr(registerv2_mod.DeepFace, 'represent', dummy_represent)
    vec = registerv2_mod.capturar_embedding(cam_index=0, objetivo_segundos=0.1)
    assert np.allclose(vec, np.array([0, 0, 1]))


def test_capturar_embedding_no_detection(monkeypatch):
    """
    Si FaceDetection nunca detecta nada, capturar_embedding debe lanzar RuntimeError.
    """
    if not hasattr(registerv2_mod, 'capturar_embedding'):
        pytest.skip("capturar_embedding no definido en registerv2.py")
    # Simular detecciones vacías
    class DummyResultsEmpty:
        detections = []
    class DummyFaceDetectionEmpty:
        def __init__(self, *args, **kwargs): pass
        def process(self, frame): return DummyResultsEmpty()
        def close(self): pass
    monkeypatch.setattr(registerv2_mod.mp.solutions.face_detection, 'FaceDetection', DummyFaceDetectionEmpty)
    # Simular cámara que genere frames hasta timeout
    class DummyCapEmpty:
        def __init__(self, idx): pass
        def read(self):
            # Retorna siempre un frame válido
            frame = np.zeros((registerv2_mod.BOX_H, registerv2_mod.BOX_W, 3), dtype=np.uint8)
            return True, frame
        def release(self): pass
    monkeypatch.setattr(registerv2_mod.cv2, 'VideoCapture', DummyCapEmpty)
    # Ejecutar con timeout breve y esperar RuntimeError
    with pytest.raises(RuntimeError):
        registerv2_mod.capturar_embedding(cam_index=0, objetivo_segundos=0.01)
