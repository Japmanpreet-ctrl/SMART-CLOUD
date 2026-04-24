# Smart Photo Cloud

Smart Photo Cloud is a web app for uploading photos, detecting faces, grouping photos by person, and browsing people-based albums.

## Current Stack

- Frontend: React + Vite
- Backend: Express
- Authentication: Firebase
- Database: Supabase PostgreSQL
- Storage: Supabase Storage

## Workspace Layout

- `docs/`
  Project checklist, implementation roadmap, API notes, and architecture decisions.
- `apps/web/`
  Planned frontend app (React or Next.js).
- `apps/api/`
  Planned backend API service.
- `apps/ai-service/`
  Planned Python AI service for face detection, embeddings, and clustering.
- `packages/db/`
  Shared database schema and setup notes.

## Proposed Build Order

1. Project checklist and architecture baseline
2. Database schema and API contract
3. Authentication integration
4. Photo upload and storage integration
5. AI processing pipeline
6. Gallery, people albums, search, rename, and delete flows
7. Testing, deployment, and performance hardening

## External Services We Expect To Plug In

- PostgreSQL with vector support (`pgvector` recommended)
- Firebase Authentication
- Object storage such as Cloudflare R2 or AWS S3

## Current Status

The workspace is scaffolded with planning documents and initial backend/data contracts so implementation can proceed feature by feature.
