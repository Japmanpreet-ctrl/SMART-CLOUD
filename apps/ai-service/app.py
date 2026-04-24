from __future__ import annotations

from io import BytesIO
import os
from typing import Any

import numpy as np
import requests
import torch
from facenet_pytorch import InceptionResnetV1, MTCNN
from flask import Flask, jsonify, request
from PIL import Image

app = Flask(__name__)


TARGET_EMBEDDING_LENGTH = 2048
FACE_MODEL_EMBEDDING_LENGTH = 512


class FaceNetEmbedder:
    def __init__(self) -> None:
        self.model = InceptionResnetV1(pretrained="vggface2").eval()
        self.model.eval()

    def embed_face(self, face_image: Image.Image) -> list[float]:
        resized = face_image.convert("RGB").resize((160, 160))
        pixels = np.asarray(resized).astype(np.float32) / 255.0
        tensor = torch.from_numpy(np.transpose(pixels, (2, 0, 1))).unsqueeze(0)
        tensor = (tensor - 0.5) / 0.5

        with torch.no_grad():
            embedding = self.model(tensor).flatten().cpu().numpy().astype(np.float32)

        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        padded = np.pad(
            embedding,
            (0, TARGET_EMBEDDING_LENGTH - FACE_MODEL_EMBEDDING_LENGTH),
            mode="constant",
        )

        return padded.tolist()


mtcnn = MTCNN(keep_all=True, device="cpu")
embedder = FaceNetEmbedder()


def load_image(image_url: str | None = None, image_path: str | None = None) -> Image.Image:
    if image_url:
        response = requests.get(image_url, timeout=20)
        response.raise_for_status()
        return Image.open(BytesIO(response.content)).convert("RGB")

    if image_path:
        return Image.open(image_path).convert("RGB")

    raise ValueError("Either imageUrl or imagePath is required")


def detect_faces(image: Image.Image) -> list[dict[str, int]]:
    boxes, probabilities = mtcnn.detect(image)
    if boxes is None:
        return []

    width, height = image.size
    faces = []
    for box, probability in zip(boxes, probabilities or []):
        if probability is None or probability < 0.9:
            continue

        x1, y1, x2, y2 = box.tolist()
        x1 = max(0, min(int(x1), width - 1))
        y1 = max(0, min(int(y1), height - 1))
        x2 = max(x1 + 1, min(int(x2), width))
        y2 = max(y1 + 1, min(int(y2), height))

        faces.append(
            {
                "x": x1,
                "y": y1,
                "width": x2 - x1,
                "height": y2 - y1,
            }
        )

    return faces


def to_normalized_box(box: dict[str, int], width: int, height: int) -> dict[str, float]:
    return {
        "x": round(box["x"] / width, 6),
        "y": round(box["y"] / height, 6),
        "width": round(box["width"] / width, 6),
        "height": round(box["height"] / height, 6),
    }


def process_image(payload: dict[str, Any]) -> dict[str, Any]:
    image = load_image(payload.get("imageUrl"), payload.get("imagePath"))
    width, height = image.size
    faces = detect_faces(image)

    processed_faces = []
    for face in faces:
        left = face["x"]
        top = face["y"]
        right = left + face["width"]
        bottom = top + face["height"]
        crop = image.crop((left, top, right, bottom))
        embedding = embedder.embed_face(crop)

        processed_faces.append(
            {
                "boundingBox": to_normalized_box(face, width, height),
                "embedding": embedding,
                "embeddingLength": len(embedding),
            }
        )

    return {
        "photoId": payload.get("photoId"),
        "imageWidth": width,
        "imageHeight": height,
        "faceCount": len(processed_faces),
        "faces": processed_faces,
    }


@app.get("/health")
def health() -> Any:
    return jsonify(
            {
                "service": "smart-photo-cloud-ai",
                "status": "ok",
                "detector": "mtcnn",
                "embeddingModel": "facenet-inception-resnet-v1",
                "storedEmbeddingLength": TARGET_EMBEDDING_LENGTH,
                "modelEmbeddingLength": FACE_MODEL_EMBEDDING_LENGTH,
            }
        )


@app.post("/process-photo")
def process_photo() -> Any:
    payload = request.get_json(silent=True) or {}

    if not payload.get("imageUrl") and not payload.get("imagePath"):
        return jsonify({"error": "imageUrl or imagePath is required"}), 400

    try:
        result = process_image(payload)
        return jsonify(result)
    except Exception as error:  # noqa: BLE001
        return jsonify({"error": "processing_failed", "message": str(error)}), 500


if __name__ == "__main__":
    app.run(
        host="127.0.0.1",
        port=int(os.environ.get("AI_SERVICE_PORT", "8000")),
        debug=False,
    )
