from __future__ import annotations

from io import BytesIO
from typing import Any

import cv2
import numpy as np
import requests
import torch
from flask import Flask, jsonify, request
from PIL import Image
from torchvision import models, transforms


CASCADE_PATH = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"

app = Flask(__name__)


class ResNetFaceEmbedder:
    def __init__(self) -> None:
        weights = models.ResNet50_Weights.DEFAULT
        model = models.resnet50(weights=weights)

        # We remove the classification head and use pooled features as embeddings.
        self.model = torch.nn.Sequential(*(list(model.children())[:-1]))
        self.model.eval()
        self.transform = transforms.Compose(
            [
                transforms.Resize((224, 224)),
                transforms.ToTensor(),
                transforms.Normalize(
                    mean=[0.485, 0.456, 0.406],
                    std=[0.229, 0.224, 0.225],
                ),
            ]
        )

    def embed_face(self, face_image: Image.Image) -> list[float]:
        tensor = self.transform(face_image.convert("RGB")).unsqueeze(0)
        with torch.no_grad():
            embedding = self.model(tensor).flatten().cpu().numpy().astype(np.float32)

        norm = np.linalg.norm(embedding)
        if norm > 0:
            embedding = embedding / norm

        return embedding.tolist()


face_detector = cv2.CascadeClassifier(CASCADE_PATH)
embedder = ResNetFaceEmbedder()


def load_image(image_url: str | None = None, image_path: str | None = None) -> Image.Image:
    if image_url:
        response = requests.get(image_url, timeout=20)
        response.raise_for_status()
        return Image.open(BytesIO(response.content)).convert("RGB")

    if image_path:
        return Image.open(image_path).convert("RGB")

    raise ValueError("Either imageUrl or imagePath is required")


def detect_faces(image: Image.Image) -> list[dict[str, int]]:
    bgr = cv2.cvtColor(np.array(image), cv2.COLOR_RGB2BGR)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    faces = face_detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(40, 40))

    return [
        {
            "x": int(x),
            "y": int(y),
            "width": int(w),
            "height": int(h),
        }
        for (x, y, w, h) in faces
    ]


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
            "detector": "opencv-haar",
            "embeddingModel": "resnet50-backbone",
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
    app.run(host="127.0.0.1", port=8000, debug=True)
