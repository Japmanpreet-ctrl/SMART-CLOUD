import { randomUUID } from "node:crypto";
import { getDb } from "./db.js";

export async function upsertAppUser({ firebaseUid, email, displayName }) {
  const db = getDb();

  const result = await db.query(
    `
      INSERT INTO app_user (id, firebase_uid, email, display_name)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (firebase_uid)
      DO UPDATE SET
        email = EXCLUDED.email,
        display_name = EXCLUDED.display_name,
        updated_at = NOW()
      RETURNING id, firebase_uid, email, display_name, created_at, updated_at
    `,
    [randomUUID(), firebaseUid, email, displayName],
  );

  return result.rows[0];
}
