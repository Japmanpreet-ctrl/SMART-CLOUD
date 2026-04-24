import { config } from "../config.js";
import { getSupabaseAdmin } from "./supabase.js";

export async function createSignedObjectUrl(storageKey, expiresInSeconds = 3600) {
  if (!storageKey) return null;

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(config.supabaseStorageBucket)
    .createSignedUrl(storageKey, expiresInSeconds);

  if (error) {
    throw error;
  }

  return data?.signedUrl || null;
}

export async function attachSignedUrlsToPhotos(photos) {
  return Promise.all(
    photos.map(async (photo) => {
      const signedUrl = await createSignedObjectUrl(photo.storage_key);
      return {
        ...photo,
        file_url: signedUrl || photo.file_url,
        thumbnail_url: signedUrl || photo.thumbnail_url || photo.file_url,
      };
    }),
  );
}

export async function attachSignedUrlsToPeople(people) {
  return Promise.all(
    people.map(async (person) => {
      const signedUrl = await createSignedObjectUrl(person.representative_storage_key);
      return {
        ...person,
        representative_photo_url: signedUrl || person.representative_photo_url,
        representative_thumbnail_url:
          signedUrl || person.representative_thumbnail_url || person.representative_photo_url,
      };
    }),
  );
}
