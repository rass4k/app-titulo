# tests/python/conftest.py
import sys, os
import pytest
import numpy as np

# 1) Inyectar src/python en sys.path para que `import registerv2` funcione tal cual
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC_PY = os.path.join(ROOT, 'src', 'python')
if SRC_PY not in sys.path:
    sys.path.insert(0, SRC_PY)

# 2) Fixture que parchea cv2.VideoCapture con frames falsos
class FakeCapture:
    def __init__(self, frames):
        self.frames = frames
        self.index = 0

    def isOpened(self):
        return self.index < len(self.frames)

    def read(self):
        if self.index < len(self.frames):
            f = self.frames[self.index]
            self.index += 1
            return True, f
        return False, None

    def release(self):
        pass

@pytest.fixture(autouse=True)
def fake_camera(monkeypatch):
    import cv2
    # Crear 5 frames grises de 480×640
    fake_frames = [np.full((480,640,3), 128, dtype=np.uint8) for _ in range(5)]
    monkeypatch.setattr(cv2, 'VideoCapture', lambda idx: FakeCapture(fake_frames))
