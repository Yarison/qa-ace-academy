import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const CategorySchema = z.object({
  category: z.enum(["api", "sql", "playwright"]).optional(),
});

export const listQuestions = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => CategorySchema.parse(data ?? {}))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("questions")
      .select("id, category, difficulty, question, answer, tags")
      .order("difficulty", { ascending: true });
    if (data.category) q = q.eq("category", data.category);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
