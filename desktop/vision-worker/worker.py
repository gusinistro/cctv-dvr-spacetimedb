#!/usr/bin/env python3
"""SpaceVision local vision worker.

Reads one JSON command per line from stdin and writes one JSON response per line.
Model weights are never downloaded by this worker. Operators register approved local
paths through the model manifest, keeping raw media and biometric templates on edge.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    import cv2  # type: ignore
except ImportError:
    cv2 = None

try:
    import numpy as np  # type: ignore
except ImportError:
    np = None

try:
    import pytesseract  # type: ignore
except ImportError:
    pytesseract = None

try:
    import onnxruntime as ort  # type: ignore
except ImportError:
    ort = None


ALLOWED_TASKS = {"objects", "ocr", "plates", "activities", "anomaly", "faces", "emotion"}
BIOMETRIC_TASKS = {"faces", "emotion"}
MANIFEST_PATH = Path(__file__).resolve().parent.parent / "model-manifest.json"


@dataclass(frozen=True)
class Policy:
    face_enabled: bool = False
    emotion_enabled: bool = False
    consent_recorded: bool = False
    human_review_required: bool = True


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def policy_from(value: dict[str, Any]) -> Policy:
    return Policy(
        face_enabled=bool(value.get("faceEnabled", False)),
        emotion_enabled=bool(value.get("emotionEnabled", False)),
        consent_recorded=bool(value.get("consentRecorded", False)),
        human_review_required=bool(value.get("humanReviewRequired", True)),
    )


def task_allowed(task: str, policy: Policy) -> tuple[bool, str | None]:
    if task not in ALLOWED_TASKS:
        return False, "tarefa_desconhecida"
    if task == "faces" and not (policy.face_enabled and policy.consent_recorded and policy.human_review_required):
        return False, "comparacao_facial_bloqueada_por_politica"
    if task == "emotion" and not (policy.emotion_enabled and policy.consent_recorded and policy.human_review_required):
        return False, "sinais_emocionais_bloqueados_por_politica"
    return True, None


def model_path(models: dict[str, Any], task: str) -> Path | None:
    item = models.get(task, {})
    candidate = item.get("path") if isinstance(item, dict) else None
    return Path(candidate).expanduser().resolve() if candidate else None


def read_image(image_path: str) -> tuple[Any | None, str | None]:
    if cv2 is None or np is None:
        return None, "dependencias_de_visao_nao_instaladas"
    path = Path(image_path).expanduser().resolve()
    if not path.is_file():
        return None, "imagem_nao_encontrada"
    image = cv2.imread(str(path))
    if image is None:
        return None, "imagem_ilegivel"
    return image, None


def ocr_result(image: Any) -> list[dict[str, Any]]:
    if pytesseract is None or cv2 is None:
        return []
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT, config="--psm 6")
    result: list[dict[str, Any]] = []
    for index, text in enumerate(data["text"]):
        clean = text.strip()
        confidence = float(data["conf"][index]) if str(data["conf"][index]).replace(".", "", 1).lstrip("-").isdigit() else -1
        if clean and confidence >= 40:
            result.append({"text": clean, "confidence": round(confidence / 100, 3), "box": {"x": data["left"][index], "y": data["top"][index], "width": data["width"][index], "height": data["height"][index]}})
    return result


def anomaly_result(image: Any) -> list[dict[str, Any]]:
    if cv2 is None or np is None:
        return []
    sharpness = float(cv2.Laplacian(image, cv2.CV_64F).var())
    if sharpness < 12:
        return [{"kind": "degradacao_visual", "confidence": round(max(0.0, 1 - sharpness / 12), 3), "reviewRequired": True}]
    return []


def model_config(models: dict[str, Any], task: str) -> dict[str, Any]:
    value = models.get(task, {})
    return value if isinstance(value, dict) else {}


def registered_models(manifest_path: Path = MANIFEST_PATH, model_dir: str | None = None) -> dict[str, Any]:
    """Resolve only operator-approved model locations declared in the local manifest."""
    if not manifest_path.is_file():
        return {}
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
        base = Path(model_dir or os.environ.get("SPACEVISION_MODEL_DIR", manifest_path.parent)).expanduser().resolve()
        result: dict[str, Any] = {}
        for pack in manifest.get("packs", []):
            if not isinstance(pack, dict) or not isinstance(pack.get("id"), str):
                continue
            path = pack.get("path")
            if isinstance(path, str):
                result[pack["id"]] = {**pack, "path": str((base / path).resolve())}
        return result
    except (OSError, json.JSONDecodeError):
        return {}


def model_session(models: dict[str, Any], task: str) -> tuple[Any | None, dict[str, Any], str | None]:
    if ort is None or np is None:
        return None, {}, "onnxruntime_nao_instalado"
    config = model_config(models, task)
    path = model_path(models, task)
    if not path or not path.is_file():
        return None, config, "model_pack_required"
    try:
        return ort.InferenceSession(str(path), providers=["CPUExecutionProvider"]), config, None
    except Exception as error:
        return None, config, f"modelo_onnx_invalido:{error}"


def labels(config: dict[str, Any], fallback: list[str]) -> list[str]:
    candidate = config.get("labels", fallback)
    return candidate if isinstance(candidate, list) and all(isinstance(value, str) for value in candidate) else fallback


def image_tensor(image: Any, session: Any) -> Any:
    if cv2 is None or np is None:
        raise RuntimeError("dependencias_de_visao_nao_instaladas")
    shape = session.get_inputs()[0].shape
    height = int(shape[-2]) if isinstance(shape[-2], int) and shape[-2] > 0 else 640
    width = int(shape[-1]) if isinstance(shape[-1], int) and shape[-1] > 0 else 640
    resized = cv2.resize(image, (width, height))
    return (resized[:, :, ::-1].transpose(2, 0, 1)[None, :, :, :] / 255.0).astype("float32")


def softmax(values: Any) -> Any:
    shifted = values - np.max(values)
    exponents = np.exp(shifted)
    return exponents / np.sum(exponents)


def detect_onnx(task: str, image: Any, models: dict[str, Any]) -> dict[str, Any]:
    session, config, error = model_session(models, task)
    if error:
        return {"task": task, "status": error, "configured": error != "model_pack_required"}
    try:
        output = session.run(None, {session.get_inputs()[0].name: image_tensor(image, session)})[0]
        matrix = np.squeeze(output)
        if matrix.ndim == 1:
            matrix = matrix[None, :]
        if matrix.ndim == 2 and matrix.shape[0] > 5 and matrix.shape[0] < matrix.shape[1]:
            matrix = matrix.T
        threshold = float(config.get("threshold", 0.45))
        class_names = labels(config, ["object"])
        found: list[dict[str, Any]] = []
        for row in matrix:
            if len(row) < 5:
                continue
            class_scores = row[4:]
            class_id = int(np.argmax(class_scores)) if len(class_scores) else 0
            confidence = float(class_scores[class_id]) if len(class_scores) else float(row[4])
            if confidence < threshold:
                continue
            cx, cy, width, height = [float(value) for value in row[:4]]
            found.append({"label": class_names[class_id] if class_id < len(class_names) else f"class_{class_id}", "confidence": round(confidence, 3), "box": {"x": round(cx - width / 2), "y": round(cy - height / 2), "width": round(width), "height": round(height)}})
        return {"task": task, "status": "ok", "items": found, "reviewRequired": True}
    except Exception as error:
        return {"task": task, "status": f"inferencia_falhou:{error}", "items": []}


def activity_onnx(image: Any, models: dict[str, Any]) -> dict[str, Any]:
    session, config, error = model_session(models, "activities")
    if error:
        return {"task": "activities", "status": error, "configured": error != "model_pack_required"}
    try:
        tensor = image_tensor(image, session)
        input_shape = session.get_inputs()[0].shape
        if len(input_shape) == 5:
            frames = int(input_shape[2]) if isinstance(input_shape[2], int) and input_shape[2] > 0 else 16
            tensor = np.repeat(tensor[:, :, None, :, :], frames, axis=2)
        output = np.squeeze(session.run(None, {session.get_inputs()[0].name: tensor})[0])
        probabilities = softmax(output)
        class_id = int(np.argmax(probabilities))
        class_names = labels(config, ["unknown_activity"])
        return {"task": "activities", "status": "ok", "items": [{"label": class_names[class_id] if class_id < len(class_names) else f"class_{class_id}", "confidence": round(float(probabilities[class_id]), 3), "reviewRequired": True}]}
    except Exception as error:
        return {"task": "activities", "status": f"inferencia_falhou:{error}", "items": []}


def vector_onnx(task: str, image: Any, models: dict[str, Any]) -> dict[str, Any]:
    session, config, error = model_session(models, task)
    if error:
        return {"task": task, "status": error, "configured": error != "model_pack_required"}
    try:
        output = np.squeeze(session.run(None, {session.get_inputs()[0].name: image_tensor(image, session)})[0])
        if task == "emotion":
            probabilities = softmax(output)
            class_id = int(np.argmax(probabilities))
            emotion_labels = labels(config, ["neutral", "positive", "negative"])
            return {"task": task, "status": "ok", "items": [{"hypothesis": emotion_labels[class_id] if class_id < len(emotion_labels) else f"class_{class_id}", "confidence": round(float(probabilities[class_id]), 3), "reviewRequired": True, "notForAutomatedDecision": True}]}
        embedding = output.astype("float32").flatten()
        norm = float(np.linalg.norm(embedding))
        if norm:
            embedding = embedding / norm
        return {"task": task, "status": "ok", "items": [{"embeddingDimension": int(embedding.size), "confidence": 1.0, "reviewRequired": True, "galleryMatchRequired": True}]}
    except Exception as error:
        return {"task": task, "status": f"inferencia_falhou:{error}", "items": []}


def analyze(command: dict[str, Any]) -> dict[str, Any]:
    tasks = [task for task in command.get("tasks", []) if isinstance(task, str)]
    policy = policy_from(command.get("policy", {}))
    models = registered_models()
    if isinstance(command.get("models"), dict):
        models.update(command["models"])
    image, image_error = read_image(str(command.get("imagePath", "")))
    response: dict[str, Any] = {"kind": "analysis", "at": utc_now(), "reviewRequired": True, "results": [], "blocked": []}
    for task in tasks:
        allowed, reason = task_allowed(task, policy)
        if not allowed:
            response["blocked"].append({"task": task, "reason": reason})
            continue
        if image_error:
            response["results"].append({"task": task, "status": image_error})
            continue
        if task == "ocr":
            response["results"].append({"task": task, "status": "ok", "items": ocr_result(image)})
        elif task == "anomaly":
            response["results"].append({"task": task, "status": "ok", "items": anomaly_result(image)})
        elif task in {"objects", "plates"}:
            response["results"].append(detect_onnx(task, image, models))
        elif task == "activities":
            response["results"].append(activity_onnx(image, models))
        else:
            response["results"].append(vector_onnx(task, image, models))
    return response


def capabilities() -> dict[str, Any]:
    return {"kind": "capabilities", "at": utc_now(), "tasks": sorted(ALLOWED_TASKS), "localOnly": True, "rawVideoUpload": False, "biometricTasks": sorted(BIOMETRIC_TASKS)}


def handle(command: dict[str, Any]) -> dict[str, Any]:
    action = command.get("action")
    if action == "health":
        return {"kind": "health", "at": utc_now(), "opencv": cv2 is not None, "ocr": pytesseract is not None, "localOnly": True}
    if action == "capabilities":
        return capabilities()
    if action == "analyze":
        return analyze(command)
    return {"kind": "error", "at": utc_now(), "message": "acao_nao_suportada"}


def main() -> None:
    for line in sys.stdin:
        try:
            print(json.dumps(handle(json.loads(line)), ensure_ascii=False), flush=True)
        except Exception as error:  # protocol boundary: return a safe error, never a traceback
            print(json.dumps({"kind": "error", "at": utc_now(), "message": str(error)}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
