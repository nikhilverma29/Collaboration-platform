import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "https://dummy.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-key"; // Must use service_role to bypass RLS since we manage tenant isolation in the API

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️ Supabase credentials missing. Storage features will fail if called.");
}

export const supabase = createClient(supabaseUrl, supabaseKey);
