import cors from "cors";
import express from "express";
import { processPhotoWithAi } from "./services/ai.js";
import { verifyFirebaseRequest } from "./services/auth.js";
import { config } from "./config.js";
import { getDb, runDbPing } from "./services/db.js";
import { getFirebaseAdmin } from "./services/firebase-admin.js";
import {
  createPhotoRecord,
  deletePhotoForUser,
  listPeopleForUser,
  listPhotosForCluster,
  listPhotosForUser,
  persistAiFaces,
  renameCluster,
} from "./services/photos.js";
import { attachSignedUrlsToPeople, attachSignedUrlsToPhotos } from "./services/storage.js";
import { getSupabaseAdmin } from "./services/supabase.js";
import { upsertAppUser } from "./services/users.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));

app.get("/health", async (_req, res) => {
  try {
    const database = await runDbPing();

    res.json({
      service: "smart-photo-cloud-api",
      status: database.ok ? "ok" : "degraded",
      integrations: {
        database,
        firebaseAdmin: Boolean(getFirebaseAdmin()),
        supabaseAdmin: Boolean(getSupabaseAdmin()),
      },
    });
  } catch (error) {
    res.status(500).json({
      service: "smart-photo-cloud-api",
      status: "error",
      message: error.message,
    });
  }
});

app.get("/api/diagnostics/db", async (_req, res) => {
  const diagnostics = await runDbPing();
  res.status(diagnostics.ok ? 200 : 503).json(diagnostics);
});

app.post("/api/auth/session", async (req, res) => {
  const { firebaseIdToken } = req.body || {};

  if (!firebaseIdToken) {
    res.status(400).json({ error: "firebaseIdToken is required" });
    return;
  }

  try {
    const decoded = await getFirebaseAdmin().auth().verifyIdToken(firebaseIdToken);
    const user = await upsertAppUser({
      firebaseUid: decoded.uid,
      email: decoded.email || `${decoded.uid}@firebase.local`,
      displayName: decoded.name || null,
    });

    res.json({
      user: {
        id: user.id,
        firebaseUid: user.firebase_uid,
        email: user.email,
        displayName: user.display_name,
      },
      next: "Use this user id for uploads, gallery queries, and people albums.",
    });
  } catch (error) {
    res.status(401).json({
      error: "invalid_firebase_token",
      message: error.message,
    });
  }
});

app.get("/api/setup/status", (_req, res) => {
  res.json({
    frontend: "react-vite",
    backend: "express",
    auth: "firebase",
    database: "supabase-postgres",
    storage: "supabase-storage",
    bucket: config.supabaseStorageBucket,
  });
});

app.post("/api/photos/upload", async (req, res) => {
  const { fileName, contentType } = req.body || {};

  if (!fileName || !contentType) {
    res.status(400).json({
      error: "fileName and contentType are required",
    });
    return;
  }

  try {
    const { decoded } = await verifyFirebaseRequest(req);
    const objectPath = `${decoded.uid}/${Date.now()}-${fileName}`;
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.storage
      .from(config.supabaseStorageBucket)
      .createSignedUploadUrl(objectPath);

    if (error) {
      throw error;
    }

    res.json({
      objectPath,
      bucket: config.supabaseStorageBucket,
      token: data.token,
      signedUrl: `${config.supabaseUrl}/storage/v1/object/upload/sign/${config.supabaseStorageBucket}/${objectPath}?token=${data.token}`,
      contentType,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: "upload_url_generation_failed",
      message: error.message,
    });
  }
});

app.post("/api/photos/complete", async (req, res) => {
  const { objectPath, contentType, fileSizeBytes } = req.body || {};

  if (!objectPath) {
    res.status(400).json({ error: "objectPath is required" });
    return;
  }

  try {
    const { decoded } = await verifyFirebaseRequest(req);
    const user = await upsertAppUser({
      firebaseUid: decoded.uid,
      email: decoded.email || `${decoded.uid}@firebase.local`,
      displayName: decoded.name || null,
    });

    const supabase = getSupabaseAdmin();
    const signedDownload = await supabase.storage
      .from(config.supabaseStorageBucket)
      .createSignedUrl(objectPath, 60 * 10);

    if (signedDownload.error) {
      throw signedDownload.error;
    }

    const publicUrl = `${config.supabaseUrl}/storage/v1/object/public/${config.supabaseStorageBucket}/${objectPath}`;
    const photo = await createPhotoRecord({
      userId: user.id,
      objectPath,
      fileUrl: publicUrl,
      thumbnailUrl: publicUrl,
      fileSizeBytes,
      fileType: contentType,
      uploadStatus: "processing",
    });

    const aiResult = await processPhotoWithAi({
      photoId: photo.id,
      imageUrl: signedDownload.data.signedUrl,
    });

    const faces = await persistAiFaces({
      userId: user.id,
      photoId: photo.id,
      faces: aiResult.faces || [],
    });

    res.json({
      photoId: photo.id,
      uploadStatus: "processed",
      faceCount: faces.length,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      error: "photo_completion_failed",
      message: error.message,
    });
  }
});

app.get("/api/photos", async (req, res) => {
  try {
    const { decoded } = await verifyFirebaseRequest(req);
    const user = await upsertAppUser({
      firebaseUid: decoded.uid,
      email: decoded.email || `${decoded.uid}@firebase.local`,
      displayName: decoded.name || null,
    });

    const photos = await attachSignedUrlsToPhotos(await listPhotosForUser(user.id));
    res.json({ photos });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: "photos_fetch_failed", message: error.message });
  }
});

app.get("/api/people", async (req, res) => {
  try {
    const { decoded } = await verifyFirebaseRequest(req);
    const user = await upsertAppUser({
      firebaseUid: decoded.uid,
      email: decoded.email || `${decoded.uid}@firebase.local`,
      displayName: decoded.name || null,
    });

    const people = await attachSignedUrlsToPeople(await listPeopleForUser(user.id));
    res.json({ people });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: "people_fetch_failed", message: error.message });
  }
});

app.get("/api/people/:clusterId/photos", async (req, res) => {
  try {
    const { decoded } = await verifyFirebaseRequest(req);
    const user = await upsertAppUser({
      firebaseUid: decoded.uid,
      email: decoded.email || `${decoded.uid}@firebase.local`,
      displayName: decoded.name || null,
    });

    const photos = await attachSignedUrlsToPhotos(
      await listPhotosForCluster(user.id, req.params.clusterId),
    );
    res.json({ photos });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: "cluster_photos_fetch_failed", message: error.message });
  }
});

app.patch("/api/people/:clusterId", async (req, res) => {
  const { displayName } = req.body || {};
  if (!displayName?.trim()) {
    res.status(400).json({ error: "displayName is required" });
    return;
  }

  try {
    const { decoded } = await verifyFirebaseRequest(req);
    const user = await upsertAppUser({
      firebaseUid: decoded.uid,
      email: decoded.email || `${decoded.uid}@firebase.local`,
      displayName: decoded.name || null,
    });

    const cluster = await renameCluster(user.id, req.params.clusterId, displayName.trim());
    if (!cluster) {
      res.status(404).json({ error: "cluster_not_found" });
      return;
    }

    res.json({ cluster });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: "cluster_rename_failed", message: error.message });
  }
});

app.delete("/api/photos/:photoId", async (req, res) => {
  try {
    const { decoded } = await verifyFirebaseRequest(req);
    const user = await upsertAppUser({
      firebaseUid: decoded.uid,
      email: decoded.email || `${decoded.uid}@firebase.local`,
      displayName: decoded.name || null,
    });

    const deleted = await deletePhotoForUser(user.id, req.params.photoId);
    if (!deleted) {
      res.status(404).json({ error: "photo_not_found" });
      return;
    }

    const supabase = getSupabaseAdmin();
    await supabase.storage.from(config.supabaseStorageBucket).remove([deleted.storage_key]);
    res.json({ deleted });
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: "photo_delete_failed", message: error.message });
  }
});

const notImplementedRoutes = [];

for (const route of notImplementedRoutes) {
  const [method, path] = route.split(" ");
  app[method.toLowerCase()](path, (req, res) => {
    res.status(501).json({
      error: "not_implemented",
      route,
      params: req.params,
      next: "Implement database queries, Supabase Storage upload flow, and AI processing.",
    });
  });
}

app.listen(config.apiPort, config.apiHost, () => {
  console.log(`Smart Photo Cloud API listening on http://${config.apiHost}:${config.apiPort}`);
});
