import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";

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

function vectorLiteral(values) {
  return `[${values.join(",")}]`;
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
  const db = getDb();
  const result = await db.query(
    `
      INSERT INTO photo (
        id, user_id, storage_key, file_url, thumbnail_url, upload_status, file_size_bytes, file_type
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      randomUUID(),
      userId,
      objectPath,
      fileUrl,
      thumbnailUrl,
      uploadStatus,
      fileSizeBytes,
      fileType,
    ],
  );

  return result.rows[0];
}

export async function listPhotosForUser(userId) {
  const db = getDb();
  const result = await db.query(
    `
      SELECT id, storage_key, file_url, thumbnail_url, upload_status, upload_date, file_size_bytes, file_type
      FROM photo
      WHERE user_id = $1
      ORDER BY upload_date DESC
    `,
    [userId],
  );
  return result.rows;
}

export async function listPeopleForUser(userId) {
  const db = getDb();
  const result = await db.query(
    `
      SELECT
        pc.id,
        pc.display_name,
        pc.created_at,
        COUNT(f.id) AS face_count,
        p.storage_key AS representative_storage_key,
        p.file_url AS representative_photo_url,
        p.thumbnail_url AS representative_thumbnail_url
      FROM person_cluster pc
      LEFT JOIN face f ON f.cluster_id = pc.id
      LEFT JOIN face rf ON rf.id = pc.representative_face_id
      LEFT JOIN photo p ON p.id = rf.photo_id
      WHERE pc.user_id = $1
      GROUP BY pc.id, p.storage_key, p.file_url, p.thumbnail_url
      ORDER BY pc.created_at DESC
    `,
    [userId],
  );
  return result.rows;
}

export async function listPhotosForCluster(userId, clusterId) {
  const db = getDb();
  const result = await db.query(
    `
      SELECT DISTINCT p.id, p.storage_key, p.file_url, p.thumbnail_url, p.upload_date, p.file_type
      FROM photo p
      INNER JOIN face f ON f.photo_id = p.id
      INNER JOIN person_cluster pc ON pc.id = f.cluster_id
      WHERE pc.user_id = $1 AND pc.id = $2
      ORDER BY p.upload_date DESC
    `,
    [userId, clusterId],
  );
  return result.rows;
}

export async function renameCluster(userId, clusterId, displayName) {
  const db = getDb();
  const result = await db.query(
    `
      UPDATE person_cluster
      SET display_name = $3, updated_at = NOW()
      WHERE user_id = $1 AND id = $2
      RETURNING id, display_name, updated_at
    `,
    [userId, clusterId, displayName],
  );
  return result.rows[0] || null;
}

export async function deletePhotoForUser(userId, photoId) {
  const db = getDb();
  const result = await db.query(
    `
      DELETE FROM photo
      WHERE user_id = $1 AND id = $2
      RETURNING id, storage_key
    `,
    [userId, photoId],
  );
  return result.rows[0] || null;
}

async function findBestCluster(client, userId, embedding, threshold = 0.82) {
  const result = await client.query(
    `
      SELECT pc.id, f.embedding
      FROM person_cluster pc
      INNER JOIN face f ON f.id = pc.representative_face_id
      WHERE pc.user_id = $1
    `,
    [userId],
  );

  let best = null;
  for (const row of result.rows) {
    if (!row.embedding) continue;
    const similarity = cosineSimilarity(embedding, row.embedding);
    if (similarity >= threshold && (!best || similarity > best.similarity)) {
      best = { id: row.id, similarity };
    }
  }

  return best;
}

export async function persistAiFaces({ userId, photoId, faces }) {
  const db = getDb();
  const client = await db.connect();

  try {
    await client.query("BEGIN");

    const insertedFaces = [];
    for (const face of faces) {
      const embedding = face.embedding || [];
      const clusterMatch = await findBestCluster(client, userId, embedding);
      let clusterId = clusterMatch?.id || null;

      if (!clusterId) {
        const clusterResult = await client.query(
          `
            INSERT INTO person_cluster (id, user_id)
            VALUES ($1, $2)
            RETURNING id
          `,
          [randomUUID(), userId],
        );
        clusterId = clusterResult.rows[0].id;
      }

      const insertFaceResult = await client.query(
        `
          INSERT INTO face (
            id, photo_id, cluster_id, embedding, bbox_x, bbox_y, bbox_width, bbox_height
          )
          VALUES ($1, $2, $3, $4::vector, $5, $6, $7, $8)
          RETURNING id, cluster_id
        `,
        [
          randomUUID(),
          photoId,
          clusterId,
          vectorLiteral(embedding),
          face.boundingBox.x,
          face.boundingBox.y,
          face.boundingBox.width,
          face.boundingBox.height,
        ],
      );

      const insertedFace = insertFaceResult.rows[0];
      insertedFaces.push(insertedFace);

      await client.query(
        `
          UPDATE person_cluster
          SET representative_face_id = COALESCE(representative_face_id, $2), updated_at = NOW()
          WHERE id = $1
        `,
        [clusterId, insertedFace.id],
      );
    }

    await client.query(
      `
        UPDATE photo
        SET upload_status = 'processed', updated_at = NOW()
        WHERE id = $1
      `,
      [photoId],
    );

    await client.query("COMMIT");
    return insertedFaces;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
