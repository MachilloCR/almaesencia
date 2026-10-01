import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../types/database";

let client: SupabaseClient<Database> | undefined;

export function getPublicSupabaseClient(): SupabaseClient<Database> {
  if (client) {
    return client;
  }

  const url = import.meta.env.PUBLIC_SUPABASE_URL;
  const key = import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Faltan las variables públicas de Supabase.");
  }

  client = createClient<Database>(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return client;
}
