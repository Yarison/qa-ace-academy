import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "@/lib/ai-gateway.server";

// ---------- Resume analysis ----------

const ResumeInput = z.object({
  text: z.string().trim().min(50).max(20000).optional(),
  pdfBase64: z.string().max(6_000_000).optional(),
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
      system: `You are an experienced hiring manager analyzing a resume for any profession. Be specific and honest.
- yearsExperience: estimate years of professional experience (integer, best guess).
- skills: concrete skills present — technical, tools, soft skills, methodologies, languages. Max 20.
- weakAreas: gaps an interviewer would probe. Concrete phrases specific to this candidate's field. Max 8.
- summary: 2-3 sentence candidate summary.`,
      prompt: `Resume:\n"""${resumeText.slice(0, 16000)}"""`,
      output: Output.object({ schema: ResumeSchema }),
    });

    return { analysis: output, resumeText };
  });

// ---------- JD analysis (universal, any profession) ----------

const JdInput = z.object({
  resumeAnalysis: ResumeSchema.nullable(),
  jobDescription: z.string().trim().min(30).max(10000),
});

const JdSchema = z.object({
  technicalSkills: z.array(z.string()).max(20),
  softSkills: z.array(z.string()).max(15),
  toolsAndTechnologies: z.array(z.string()).max(20),
  industryKnowledge: z.array(z.string()).max(15),
  certifications: z.array(z.string()).max(10),
  keywordsAndCompetencies: z.array(z.string()).max(20),
  likelyQuestions: z.array(z.string()).max(15),
  matchScore: z.number().min(0).max(100).nullable(),
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
      system: `You are an expert interview coach analyzing a job description for ANY profession (engineering, marketing, finance, healthcare, design, sales, operations, etc.). Extract structured requirements.

Return:
- technicalSkills: hard/technical skills the JD names or implies (empty [] if not applicable).
- softSkills: interpersonal, leadership, communication competencies.
- toolsAndTechnologies: named software, platforms, systems, or equipment.
- industryKnowledge: domain knowledge / regulations / market context.
- certifications: named certifications, licenses, credentials, or methodologies (e.g. PMP, CFA, Six Sigma, Scrum, HIPAA).
- keywordsAndCompetencies: important phrases and competencies the employer emphasizes.
- likelyQuestions: 8-12 interview questions tailored to THIS role, referencing the JD's language. One sentence each. Mix behavioral + role-specific.
- matchScore: 0-100 fit against the candidate — return null if no resumeAnalysis provided.
- summary: 2-3 sentences describing the role and what the interview will emphasize.

Every list must be JD-specific — do not return generic filler.`,
      prompt: `Candidate analysis (may be null):\n${JSON.stringify(data.resumeAnalysis)}\n\nJob description:\n"""${data.jobDescription}"""`,
      output: Output.object({ schema: JdSchema }),
    });

    return output;
  });

// ---------- AI-generated study plan ----------

const PlanDaySchema = z.object({
  date: z.string(),
  focusArea: z.string().max(80),
  topics: z.array(z.string()).max(8),
  activities: z.array(z.string()).max(6),
  estimatedHours: z.number().min(0).max(12),
  questions: z.array(z.string()).max(6).optional(),
});


const PlanInput = z.object({
  jobDescription: z.string().min(10).max(10000),
  jdAnalysis: JdSchema.nullable(),
  resumeAnalysis: ResumeSchema.nullable(),
  experienceLevel: z.enum(["beginner", "intermediate", "experienced"]),
  hoursPerDay: z.number().min(1).max(12),
  days: z.number().int().min(1).max(60),
  startDate: z.string(), // ISO
});

const PlanSchema = z.object({
  plan: z.array(PlanDaySchema).max(60),
});

export const generatePlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => PlanInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");
    const gateway = createLovableAiGatewayProvider(key);

    const { output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      system: `You are an interview preparation coach. Build a day-by-day preparation schedule for ANY profession based on the job description, the candidate's background, and their time budget.

Rules:
- Return exactly ${data.days} entries in "plan", one per day, starting on ${data.startDate}. Increment date by one day each entry (YYYY-MM-DD).
- Each day's estimatedHours must be <= ${data.hoursPerDay} (respect the candidate's time budget).
- Tailor the plan to the candidate's experienceLevel="${data.experienceLevel}": beginners spend more time on foundations, experienced candidates focus on advanced/behavioral/company-specific prep.
- Prioritize gaps: missing skills from the resume vs JD, weak areas, and topics the employer emphasizes.
- focusArea should be a short category (e.g. "Technical foundations", "Tools mastery", "Behavioral stories", "Industry knowledge", "Mock interview", "Rest & review").
- topics: 2-5 specific topics from the JD/resume analysis.
- activities: 2-5 concrete actions ("Read X", "Draft STAR story about Y", "Complete 5 practice problems on Z", "Research the company's recent product launches").
- If days >= 3, dedicate the second-to-last day to a full mock interview.
- The last day is always light: rest, review notes, prepare questions for the interviewer.
- Front-load high-priority gaps; back-load review and behavioral prep.
- questions: 3-5 realistic interview questions the candidate should be able to answer at the end of that day. Match the day's focusArea and topics. Behavioral days -> behavioral questions; technical/tools days -> technical/scenario questions. Be specific to THIS role. Skip questions on pure "Rest & review" days.
- Be specific to THIS role — no generic filler.`,
      prompt: `startDate: ${data.startDate}
days: ${data.days}
hoursPerDay: ${data.hoursPerDay}
experienceLevel: ${data.experienceLevel}

Job description:
"""${data.jobDescription.slice(0, 6000)}"""

JD analysis:
${JSON.stringify(data.jdAnalysis)}

Resume analysis (may be null):
${JSON.stringify(data.resumeAnalysis)}`,
      output: Output.object({ schema: PlanSchema }),
    });

    return output.plan;
  });

// ---------- Persistence (signed-in users only) ----------

const PrepStateSchema = z.object({
  resumeText: z.string(),
  resumeAnalysis: z.union([ResumeSchema, z.null()]),
  jobDescription: z.string(),
  jdAnalysis: z.union([JdSchema, z.null()]),
  interviewDate: z.union([z.string(), z.null()]).optional(),
  plan: z.array(PlanDaySchema),
  completed: z.array(z.string()),
}).passthrough();

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
        interview_date: data.interviewDate ?? null,
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
      plan: (data.plan as z.infer<typeof PlanDaySchema>[] | null) ?? [],
      completed: (data.completed as string[] | null) ?? [],
    };
  });
