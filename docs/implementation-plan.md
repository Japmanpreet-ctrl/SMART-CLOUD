# Implementation Plan

## Architecture From The SRS

- Frontend web app
- Backend API service
- Python AI service
- PostgreSQL for metadata and embeddings
- Object storage for original photos and thumbnails

## Recommended Build Sequence

### Phase 1

Set the contract:

- Finalize folder structure
- Define entities and API routes
- Prepare environment variable template

### Phase 2

Secure user access:

- Integrate Firebase Authentication
- Add backend auth verification
- Attach uploaded photos to the authenticated user

### Phase 3

Move images safely:

- Upload to object storage
- Save photo metadata in PostgreSQL
- Trigger async AI processing

### Phase 4

Make AI useful:

- Detect faces
- Generate embeddings
- Cluster by person
- Persist faces and person clusters

### Phase 5

Ship the product experience:

- Gallery page
- People albums
- Search
- Rename cluster
- Delete photo

## External Inputs Needed From You

- PostgreSQL connection details
- Firebase project config
- Storage provider choice and credentials
- Decision on React vs Next.js
- Decision on Express vs Fastify/Nest/FastAPI-style API preference
