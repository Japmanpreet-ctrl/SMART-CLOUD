import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { getSupabaseAdmin } from "./supabase.js";

function cosineSimilarity(left, right) {
  if (!left.length || left.length !== right.length) return -1;

  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < left.length; i += 1) {
    dot += left[i] * right[i];
    leftNorm += left[i] * left[i];
    rightNorm += right[i] * right[i];
  }

  if (!leftNorm || !rightNorm) return -1;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function parseEmbeddingVector(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => Number(entry));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed.startsWith("[") || !trimmed.endsWith("]")) {
      return [];
    }

    return trimmed
      .slice(1, -1)
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isFinite(entry));
  }

  return [];
}

function vectorLiteral(values) {
  return `[${values.join(",")}]`;
}

function requireNoError(error) {
  if (error) throw error;
}

export async function createPhotoRecord({
  userId,
  objectPath,
  fileUrl,
  thumbnailUrl = null,
  fileSizeBytes = null,
  fileType = null,
  uploadStatus = "uploaded",
}) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("photo")
    .insert({
      id: randomUUID(),
      user_id: userId,
      storage_key: objectPath,
      file_url: fileUrl,
      thumbnail_url: thumbnailUrl,
      upload_status: uploadStatus,
      file_size_bytes: fileSizeBytes,
      file_type: fileType,
    })
    .select("*")
    .single();

  requireNoError(error);
  return data;
}

export async function listPhotosForUser(userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("photo")
    .select("id, storage_key, file_url, thumbnail_url, upload_status, upload_date, file_size_bytes, file_type")
    .eq("user_id", userId)
    .order("upload_date", { ascending: false });

  requireNoError(error);
  return data || [];
}

export async function listPhotoSourcesForUser(userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("photo")
    .select("id, storage_key, file_type")
    .eq("user_id", userId)
    .order("upload_date", { ascending: true });

  requireNoError(error);
  return data || [];
}

export async function listPeopleForUser(userId) {
  const supabase = getSupabaseAdmin();
  const { data: clusters, error: clusterError } = await supabase
    .from("person_cluster")
    .select("id, display_name, created_at, representative_face_id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  requireNoError(clusterError);
  if (!clusters?.length) return [];

  const clusterIds = clusters.map((cluster) => cluster.id);
  const { data: faces, error: faceError } = await supabase
    .from("face")
    .select("id, cluster_id, photo_id")
    .in("cluster_id", clusterIds);

  requireNoError(faceError);

  const faceCountByCluster = new Map();
  const faceById = new Map();
  for (const face of faces || []) {
    faceCountByCluster.set(face.cluster_id, (faceCountByCluster.get(face.cluster_id) || 0) + 1);
    faceById.set(face.id, face);
  }

  const representativePhotoIds = Array.from(
    new Set(
      clusters
        .map((cluster) => faceById.get(cluster.representative_face_id)?.photo_id)
        .filter(Boolean),
    ),
  );

  let photoById = new Map();
  if (representativePhotoIds.length) {
    const { data: photos, error: photoError } = await supabase
      .from("photo")
      .select("id, storage_key, file_url, thumbnail_url")
      .in("id", representativePhotoIds);

    requireNoError(photoError);
    photoById = new Map((photos || []).map((photo) => [photo.id, photo]));
  }

  return clusters.map((cluster) => {
    const representativeFace = faceById.get(cluster.representative_face_id);
    const representativePhoto = representativeFace ? photoById.get(representativeFace.photo_id) : null;

    return {
      id: cluster.id,
      display_name: cluster.display_name,
      created_at: cluster.created_at,
      face_count: faceCountByCluster.get(cluster.id) || 0,
      representative_storage_key: representativePhoto?.storage_key || null,
      representative_photo_url: representativePhoto?.file_url || null,
      representative_thumbnail_url: representativePhoto?.thumbnail_url || null,
    };
  });
}

export async function listPhotosForCluster(userId, clusterId) {
  const supabase = getSupabaseAdmin();
  const { data: cluster, error: clusterError } = await supabase
    .from("person_cluster")
    .select("id")
    .eq("id", clusterId)
    .eq("user_id", userId)
    .maybeSingle();

  requireNoError(clusterError);
  if (!cluster) return [];

  const { data: faces, error: faceError } = await supabase
    .from("face")
    .select("photo_id")
    .eq("cluster_id", clusterId);

  requireNoError(faceError);
  const photoIds = Array.from(new Set((faces || []).map((face) => face.photo_id).filter(Boolean)));
  if (!photoIds.length) return [];

  const { data: photos, error: photoError } = await supabase
    .from("photo")
    .select("id, storage_key, file_url, thumbnail_url, upload_date, file_type")
    .in("id", photoIds)
    .order("upload_date", { ascending: false });

  requireNoError(photoError);
  return photos || [];
}

export async function renameCluster(userId, clusterId, displayName) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("person_cluster")
    .update({
      display_name: displayName,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("id", clusterId)
    .select("id, display_name, updated_at")
    .maybeSingle();

  requireNoError(error);
  return data || null;
}

export async function deletePhotoForUser(userId, photoId) {
  const supabase = getSupabaseAdmin();
  const { data: existing, error: existingError } = await supabase
    .from("photo")
    .select("id, storage_key")
    .eq("user_id", userId)
    .eq("id", photoId)
    .maybeSingle();

  requireNoError(existingError);
  if (!existing) return null;

  const { error } = await supabase
    .from("photo")
    .delete()
    .eq("user_id", userId)
    .eq("id", photoId);

  requireNoError(error);
  return existing;
}

export async function resetPeopleAlbumsForUser(userId) {
  const supabase = getSupabaseAdmin();
  const photos = await listPhotoSourcesForUser(userId);
  const photoIds = photos.map((photo) => photo.id);

  if (photoIds.length) {
    const { error: faceDeleteError } = await supabase
      .from("face")
      .delete()
      .in("photo_id", photoIds);

    requireNoError(faceDeleteError);
  }

  const { error: clusterDeleteError } = await supabase
    .from("person_cluster")
    .delete()
    .eq("user_id", userId);

  requireNoError(clusterDeleteError);

  const { error: photoUpdateError } = await supabase
    .from("photo")
    .update({
      upload_status: "queued",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  requireNoError(photoUpdateError);
}

async function findBestCluster(userId, embedding, threshold = config.faceClusterThreshold) {
  const supabase = getSupabaseAdmin();
  const { data: clusters, error: clusterError } = await supabase
    .from("person_cluster")
    .select("id")
    .eq("user_id", userId);

  requireNoError(clusterError);
  if (!clusters?.length) return null;

  const clusterIds = clusters.map((cluster) => cluster.id);
  const { data: faces, error: faceError } = await supabase
    .from("face")
    .select("cluster_id, embedding")
    .in("cluster_id", clusterIds);

  requireNoError(faceError);

  let best = null;
  for (const row of faces || []) {
    const existingEmbedding = parseEmbeddingVector(row.embedding);
    const similarity = cosineSimilarity(embedding, existingEmbedding);
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { id: row.cluster_id, similarity };
    }
  }

  return best;
}

export async function persistAiFaces({ userId, photoId, faces }) {
  const supabase = getSupabaseAdmin();
  const insertedFaces = [];

  for (const face of faces) {
    const embedding = face.embedding || [];
    const clusterMatch = await findBestCluster(userId, embedding);
    let clusterId = clusterMatch?.id || null;

    if (!clusterId) {
      const { data: cluster, error: clusterError } = await supabase
        .from("person_cluster")
        .insert({
          id: randomUUID(),
          user_id: userId,
        })
        .select("id")
        .single();

      requireNoError(clusterError);
      clusterId = cluster.id;
    }

    const faceId = randomUUID();
    const { data: insertedFace, error: faceError } = await supabase
      .from("face")
      .insert({
        id: faceId,
        photo_id: photoId,
        cluster_id: clusterId,
        embedding: vectorLiteral(embedding),
        bbox_x: face.boundingBox.x,
        bbox_y: face.boundingBox.y,
        bbox_width: face.boundingBox.width,
        bbox_height: face.boundingBox.height,
      })
      .select("id, cluster_id")
      .single();

    requireNoError(faceError);
    insertedFaces.push(insertedFace);

    const { data: currentCluster, error: currentClusterError } = await supabase
      .from("person_cluster")
      .select("representative_face_id")
      .eq("id", clusterId)
      .maybeSingle();

    requireNoError(currentClusterError);

    if (!currentCluster?.representative_face_id) {
      const { error: updateClusterError } = await supabase
        .from("person_cluster")
        .update({
          representative_face_id: faceId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", clusterId);

      requireNoError(updateClusterError);
    }
  }

  const { error: updatePhotoError } = await supabase
    .from("photo")
    .update({
      upload_status: "processed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", photoId);

  requireNoError(updatePhotoError);
  return insertedFaces;
}
