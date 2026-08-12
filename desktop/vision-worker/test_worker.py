import sys
import json
import tempfile
from pathlib import Path
import numpy as np
import unittest

sys.path.append(str(Path(__file__).parent))
import worker


class WorkerPolicyTests(unittest.TestCase):
    def test_blocks_face_matching_without_consent_and_review(self):
        result = worker.handle({"action": "analyze", "tasks": ["faces"], "policy": {}})
        self.assertEqual(result["blocked"][0]["reason"], "comparacao_facial_bloqueada_por_politica")

    def test_blocks_emotional_signal_without_consent_and_review(self):
        result = worker.handle({"action": "analyze", "tasks": ["emotion"], "policy": {}})
        self.assertEqual(result["blocked"][0]["reason"], "sinais_emocionais_bloqueados_por_politica")

    def test_returns_local_capabilities_without_video_upload(self):
        result = worker.handle({"action": "capabilities"})
        self.assertTrue(result["localOnly"])
        self.assertFalse(result["rawVideoUpload"])

    def test_resolves_only_models_registered_in_the_local_manifest(self):
        with tempfile.TemporaryDirectory() as directory:
            manifest_path = Path(directory) / "model-manifest.json"
            manifest_path.write_text(json.dumps({"packs": [{"id": "objects", "path": "approved/objects.onnx", "labels": ["person"]}]}), encoding="utf-8")
            resolved = worker.registered_models(manifest_path)
            self.assertEqual(resolved["objects"]["labels"], ["person"])
            self.assertEqual(Path(resolved["objects"]["path"]), (Path(directory) / "approved/objects.onnx").resolve())

    @unittest.skipIf(worker.ort is None or worker.cv2 is None, "dependências ONNX/OpenCV indisponíveis")
    def test_executes_registered_object_and_activity_models(self):
        fixtures = Path(__file__).parent / ".test-models"
        models = {
            "objects": {"path": str(fixtures / "objects.onnx"), "labels": ["person"]},
            "plates": {"path": str(fixtures / "objects.onnx"), "labels": ["license_plate"]},
            "activities": {"path": str(fixtures / "activities.onnx"), "labels": ["walking", "running"]},
        }
        image = np.zeros((640, 640, 3), dtype=np.uint8)
        detection = worker.detect_onnx("objects", image, models)
        plate = worker.detect_onnx("plates", image, models)
        activity = worker.activity_onnx(image, models)
        self.assertEqual(detection["status"], "ok")
        self.assertEqual(detection["items"][0]["label"], "person")
        self.assertEqual(plate["status"], "ok")
        self.assertEqual(plate["items"][0]["label"], "license_plate")
        self.assertEqual(activity["status"], "ok")
        self.assertEqual(activity["items"][0]["label"], "running")


if __name__ == "__main__":
    unittest.main()
