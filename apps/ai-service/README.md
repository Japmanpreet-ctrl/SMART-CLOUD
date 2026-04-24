# AI Service

This service now contains the first real implementation of the AI layer described in the SRS.

## What It Does

- Downloads or reads an image
- Detects faces with OpenCV's Haar cascade
- Crops each detected face
- Generates a feature embedding with a ResNet backbone from `torchvision`

## Current Model Choice

- Backbone: `ResNet50`
- Strategy: remove the classification head and use the pooled feature vector as the face embedding

This gives us a practical ResNet-based embedding pipeline now, while leaving room to upgrade later to ArcFace, FaceNet, or another face-specialized model.

## Endpoints

- `GET /health`
- `POST /process-photo`

## Example Request

```json
{
  "photoId": "uuid",
  "imageUrl": "https://example.com/photo.jpg"
}
```

## Example Response

```json
{
  "photoId": "uuid",
  "faceCount": 1,
  "faces": [
    {
      "boundingBox": {
        "x": 0.1,
        "y": 0.2,
        "width": 0.3,
        "height": 0.4
      },
      "embeddingLength": 2048
    }
  ]
}
```

## Important Note

This is a solid first implementation, but it is not yet a face-specialized production model. The next upgrade path would be:

1. better detector such as RetinaFace or MTCNN
2. stronger face embedding model such as ArcFace
3. clustering with DBSCAN or cosine-threshold grouping
