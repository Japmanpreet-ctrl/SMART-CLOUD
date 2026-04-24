import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "./supabase.js";

function normalizeDisplayName(displayName) {
  return displayName?.trim() || null;
}

export async function upsertAppUser({ firebaseUid, email, displayName }) {
  const supabase = getSupabaseAdmin();
  const normalizedDisplayName = normalizeDisplayName(displayName);

  const { data: byFirebaseUid, error: firebaseLookupError } = await supabase
    .from("app_user")
    .select("id, firebase_uid, email, display_name, created_at, updated_at")
    .eq("firebase_uid", firebaseUid)
    .maybeSingle();

  if (firebaseLookupError) {
    throw firebaseLookupError;
  }

  if (byFirebaseUid) {
    const { data, error } = await supabase
      .from("app_user")
      .update({
        email,
        display_name: normalizedDisplayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", byFirebaseUid.id)
      .select("id, firebase_uid, email, display_name, created_at, updated_at")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data: byEmail, error: emailLookupError } = await supabase
    .from("app_user")
    .select("id, firebase_uid, email, display_name, created_at, updated_at")
    .eq("email", email)
    .maybeSingle();

  if (emailLookupError) {
    throw emailLookupError;
  }

  if (byEmail) {
    const { data, error } = await supabase
      .from("app_user")
      .update({
        firebase_uid: firebaseUid,
        display_name: normalizedDisplayName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", byEmail.id)
      .select("id, firebase_uid, email, display_name, created_at, updated_at")
      .single();

    if (error) {
      throw error;
    }

    return data;
  }

  const { data, error } = await supabase
    .from("app_user")
    .insert({
      id: randomUUID(),
      firebase_uid: firebaseUid,
      email,
      display_name: normalizedDisplayName,
    })
    .select("id, firebase_uid, email, display_name, created_at, updated_at")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
