import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

const CategorySchema = z.object({
  category: z.enum(["api", "sql", "playwright"]).optional(),
});

function createAnonClient() {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase URL or key");
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const listQuestions = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => CategorySchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const supabase = createAnonClient();
    let q = supabase
      .from("questions")
      .select("id, category, difficulty, question, answer, tags")
      .order("difficulty", { ascending: true });
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
