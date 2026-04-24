import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

let supabase;

export function getSupabaseAdmin() {
  if (!supabase) {
    supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return supabase;
}
