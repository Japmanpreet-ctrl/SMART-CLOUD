import { getSupabaseAdmin } from "./supabase.js";

export function getDb() {
  return null;
}

export async function runDbPing() {
  const supabase = getSupabaseAdmin();
  const startedAt = Date.now();

  try {
    const { data, error } = await supabase.from("app_user").select("id").limit(1);

    if (error) {
      throw error;
    }

    return {
      ok: true,
      durationMs: Date.now() - startedAt,
      row: {
        source: "supabase-rest",
        sampleRows: data?.length || 0,
      },
    };
  } catch (error) {
    return {
      ok: false,
      durationMs: Date.now() - startedAt,
      error: error.message,
    };
  }
}
