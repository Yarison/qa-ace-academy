import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

// ---------- Resume analysis ----------

const ResumeInput = z.object({
  text: z.string().trim().min(50).max(20000).optional(),
  pdfBase64: z.string().max(6_000_000).optional(), // ~4.5MB PDF
}).refine((v) => v.text || v.pdfBase64, { message: "Provide text or PDF" });

const ResumeSchema = z.object({
  yearsExperience: z.number().min(0).max(60),
  skills: z.array(z.string()).max(40),
  weakAreas: z.array(z.string()).max(20),
  summary: z.string().max(600),
});

export const analyzeResume = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => ResumeInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    // If a PDF is supplied, call the gateway directly to use Gemini's file support.
    let resumeText = data.text ?? "";
    if (data.pdfBase64 && !resumeText) {
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Extract ALL text content from this resume PDF, preserving section headings and dates. Return only the plain text — no commentary." },
                { type: "file", file: { filename: "resume.pdf", file_data: `data:application/pdf;base64,${data.pdfBase64}` } },
              ],
            },
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`PDF extraction failed (${res.status}): ${body.slice(0, 300)}`);
      }
      const json = await res.json();
      resumeText = json?.choices?.[0]?.message?.content ?? "";
      if (!resumeText || resumeText.length < 40) {
        throw new Error("Could not extract text from PDF. Try pasting text instead.");
      }
    }

    const gateway = createLovableAiGatewayProvider(key);
    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: `You are a QA hiring manager analyzing a resume. Be specific and honest.
- yearsExperience: estimate years of professional QA/software testing experience (integer, best guess).
- skills: concrete technical skills present (tools, languages, frameworks). Max 20.
- weakAreas: gaps a QA interviewer would probe (e.g. "no API automation experience", "limited SQL", "no CI/CD"). Max 8. Concrete phrases, not generic.
- summary: 2-3 sentence candidate summary.`,
      prompt: `Resume:\n"""${resumeText.slice(0, 16000)}"""`,
      output: Output.object({ schema: ResumeSchema }),
    });

    return { analysis: output, resumeText };
  });

// ---------- JD comparison ----------

const JdInput = z.object({
  resumeAnalysis: ResumeSchema,
  jobDescription: z.string().trim().min(30).max(10000),
});

const JdSchema = z.object({
  missingSkills: z.array(z.string()).max(20),
  likelyQuestions: z.array(z.string()).max(15),
  topicsToReview: z.array(z.string()).max(15),
  matchScore: z.number().min(0).max(100),
  summary: z.string().max(600),
});

export const analyzeJd = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => JdInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);

    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: `You are a QA hiring manager. Compare a candidate against a job description.
Return:
- missingSkills: skills the JD requires that the candidate lacks. Concrete, JD-specific. Max 10.
- likelyQuestions: 8-12 questions this candidate should expect for THIS role. Reference JD tools/domains explicitly. One sentence each.
- topicsToReview: 5-8 technical topics the candidate should study before the interview. Short phrases.
- matchScore: 0-100 overall fit.
- summary: 2-3 sentence assessment.`,
      prompt: `Candidate:\n${JSON.stringify(data.resumeAnalysis)}\n\nJob description:\n"""${data.jobDescription}"""`,
      output: Output.object({ schema: JdSchema }),
    });

    return output;
  });

// ---------- Persistence (signed-in users only) ----------

const PrepStateSchema = z.object({
  resumeText: z.string(),
  resumeAnalysis: z.union([ResumeSchema, z.null()]),
  jobDescription: z.string(),
  jdAnalysis: z.union([JdSchema, z.null()]),
  interviewDate: z.union([z.string(), z.null()]),
  plan: z.array(z.object({
    date: z.string(),
    topic: z.enum(["api", "sql", "playwright", "mock", "review"]),
    focus: z.string(),
    drills: z.array(z.string()),
  })),
  completed: z.array(z.string()),
});

export const savePrep = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PrepStateSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("prep_sessions")
      .upsert({
        user_id: userId,
        resume_text: data.resumeText,
        resume_analysis: data.resumeAnalysis,
        job_description: data.jobDescription,
        jd_analysis: data.jdAnalysis,
        interview_date: data.interviewDate,
        plan: data.plan,
        completed: data.completed,
      }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const loadPrep = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("prep_sessions")
      .select("resume_text, resume_analysis, job_description, jd_analysis, interview_date, plan, completed")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    return {
      resumeText: data.resume_text ?? "",
      resumeAnalysis: (data.resume_analysis as z.infer<typeof ResumeSchema> | null) ?? null,
      jobDescription: data.job_description ?? "",
      jdAnalysis: (data.jd_analysis as z.infer<typeof JdSchema> | null) ?? null,
      interviewDate: data.interview_date ?? null,
      plan: (data.plan as z.infer<typeof PrepStateSchema>["plan"] | null) ?? [],
      completed: (data.completed as string[] | null) ?? [],
    };
  });
