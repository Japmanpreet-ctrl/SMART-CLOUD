# Smart Photo Cloud Checklist

Derived from the SRS dated March 18, 2026.

## 1. Foundation

- [x] Analyze SRS and extract scope
- [x] Create project workspace
- [x] Break requirements into implementation phases
- [x] Define target architecture: web app + API + AI service + storage + PostgreSQL
- [ ] Choose frontend stack: React or Next.js
- [ ] Choose backend stack: Node.js framework
- [ ] Choose Python AI stack
- [ ] Confirm deployment targets

## 2. Product Requirements

- [ ] User registration/login
- [ ] Cloud photo upload
- [ ] Photo metadata persistence
- [ ] Face detection
- [ ] Face embedding generation
- [ ] Face clustering
- [ ] Gallery view
- [ ] People album view
- [ ] Rename person cluster
- [ ] Delete photo
- [ ] Search photos by person/name

## 3. Data Layer

- [x] Define core entities from SRS
- [x] Define relationships
- [ ] Provision PostgreSQL
- [ ] Enable vector support
- [ ] Create migrations
- [ ] Add seed/dev setup

## 4. Integrations

- [ ] Firebase Authentication setup
- [ ] Object storage setup (R2 or S3)
- [ ] Signed upload/download strategy
- [ ] AI service to backend integration
- [ ] Async processing workflow for uploads

## 5. Backend API

- [x] Draft API contract
- [ ] Implement auth/session middleware
- [ ] Implement upload endpoint
- [ ] Implement gallery endpoint
- [ ] Implement people endpoint
- [ ] Implement rename cluster endpoint
- [ ] Implement delete photo endpoint
- [ ] Implement search endpoint

## 6. AI Service

- [ ] Face detection endpoint
- [ ] Face embedding endpoint
- [ ] Clustering strategy
- [ ] Background processing flow
- [ ] Error handling and retries

## 7. Frontend

- [ ] Auth screens
- [ ] Upload flow
- [ ] Gallery page
- [ ] People page
- [ ] Search UI
- [ ] Delete confirmation flow
- [ ] Rename cluster flow
- [ ] Mobile responsiveness

## 8. Quality

- [ ] Validation and security checks
- [ ] Logging and monitoring
- [ ] API tests
- [ ] UI tests
- [ ] AI pipeline smoke tests
- [ ] Performance review for async uploads

## 9. Deployment

- [ ] Environment variable strategy
- [ ] Deployment config for web/api/ai service
- [ ] Storage bucket setup
- [ ] Production database setup
- [ ] Final documentation

## Immediate Next Steps

1. Confirm the tech choices for frontend, backend, AI library, and storage.
2. Connect PostgreSQL and Firebase.
3. Implement auth and upload first, because the rest of the product depends on them.
