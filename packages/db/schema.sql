CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE app_user (
  id UUID PRIMARY KEY,
  firebase_uid TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE photo (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  file_url TEXT NOT NULL,
  thumbnail_url TEXT,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  upload_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  file_size_bytes BIGINT,
  file_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE person_cluster (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  display_name TEXT,
  representative_face_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE face (
  id UUID PRIMARY KEY,
  photo_id UUID NOT NULL REFERENCES photo(id) ON DELETE CASCADE,
  cluster_id UUID REFERENCES person_cluster(id) ON DELETE SET NULL,
  embedding VECTOR(2048),
  bbox_x DOUBLE PRECISION NOT NULL,
  bbox_y DOUBLE PRECISION NOT NULL,
  bbox_width DOUBLE PRECISION NOT NULL,
  bbox_height DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE person_cluster
ADD CONSTRAINT person_cluster_representative_face_fk
FOREIGN KEY (representative_face_id) REFERENCES face(id) ON DELETE SET NULL;

CREATE INDEX idx_photo_user_id_upload_date ON photo(user_id, upload_date DESC);
CREATE INDEX idx_person_cluster_user_id ON person_cluster(user_id);
CREATE INDEX idx_face_photo_id ON face(photo_id);
CREATE INDEX idx_face_cluster_id ON face(cluster_id);
