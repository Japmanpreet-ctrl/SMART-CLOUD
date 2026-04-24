# API Contract Draft

## Auth

### `POST /api/auth/session`

Creates or refreshes the backend session after Firebase authentication.

Request body:

```json
{
  "firebaseIdToken": "string"
}
```

Response:

```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "displayName": "User"
  }
}
```

## Photos

### `POST /api/photos/upload`

Creates an upload record and returns storage instructions.

### `POST /api/photos/complete`

Marks an upload as completed and triggers AI processing.

### `GET /api/photos`

Returns gallery photos for the authenticated user.

Query params:

- `cursor`
- `limit`
- `search`

### `DELETE /api/photos/:photoId`

Deletes the photo, related face rows, and storage object.

## People

### `GET /api/people`

Returns the user's face clusters with representative thumbnails.

### `PATCH /api/people/:clusterId`

Renames a person cluster.

Request body:

```json
{
  "displayName": "Mom"
}
```

### `GET /api/people/:clusterId/photos`

Returns all photos associated with a cluster.

## AI Service

### `POST /process-photo`

Processes a single uploaded photo.

Request body:

```json
{
  "photoId": "uuid",
  "imageUrl": "https://storage.example.com/file.jpg"
}
```

Response body:

```json
{
  "faces": [
    {
      "boundingBox": {
        "x": 0.1,
        "y": 0.2,
        "width": 0.3,
        "height": 0.4
      },
      "embedding": [0.123, 0.456]
    }
  ]
}
```
