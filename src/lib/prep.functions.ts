import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output } from "ai";
import { z } from "zod";
import { createGeminiProvider } from "@/lib/ai-gateway.server";

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
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");

    let resumeText = data.text ?? "";
    if (data.pdfBase64 && !resumeText) {
      const res = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: "Extract ALL text content from this resume PDF, preserving section headings and dates. Return only the plain text — no commentary." },
                { inlineData: { mimeType: "application/pdf", data: data.pdfBase64 } },
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

    const gateway = createGeminiProvider(key);
    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
      system: `You are an experienced hiring manager analyzing a resume for any profession. Be specific and honest.
- yearsExperience: estimate years of professional experience (integer, best guess).
- skills: concrete skills present — technical, tools, soft skills, methodologies, languages. Max 20.
- weakAreas: gaps an interviewer would probe. Concrete phrases specific to this candidate's field. Max 8.
- summary: 2-3 sentence candidate summary.`,
      prompt: `Resume:\n"""${resumeText.slice(0, 16000)}"""`,
      experimental_output: Output.object({ schema: ResumeSchema }),
    });

    return { analysis: result.experimental_output, resumeText };
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
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const gateway = createGeminiProvider(key);

    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
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
      experimental_output: Output.object({ schema: JdSchema }),
    });

    return result.experimental_output;
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
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const gateway = createGeminiProvider(key);

    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
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
      experimental_output: Output.object({ schema: PlanSchema }),
    });

    return result.experimental_output.plan;
  });

// ---------- Answer evaluation ----------

const EvalInput = z.object({
  question: z.string().min(1).max(2000),
  answer: z.string().min(1).max(8000),
  focusArea: z.string().max(120).optional(),
  jobDescription: z.string().max(10000).optional(),
  jdAnalysis: JdSchema.nullable().optional(),
  resumeAnalysis: ResumeSchema.nullable().optional(),
});

const EvalSchema = z.object({
  score: z.number().min(0).max(10),
  feedback: z.string().max(1200),
  weakAreas: z.array(z.string()).max(6),
  followUpQuestions: z.array(z.string()).max(4),
  exampleAnswer: z.string().max(300).nullable(),
});

export const evaluateAnswer = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => EvalInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const gateway = createGeminiProvider(key);

    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
      system: `You are a rigorous but supportive interview coach. Evaluate the candidate's answer to a real interview question. Be honest, concrete, and specific to the role.

Return:
- score: 0-10 (0-3 poor/off-topic, 4-6 partial, 7-8 solid, 9-10 excellent + role-tailored).
- feedback: 2-4 sentences. Call out what was strong, what was missing, and one concrete way to improve.
- weakAreas: 1-4 short phrases naming underlying gaps (e.g. "STAR structure", "quantifying impact", "SQL window functions"). These will be used to personalize the next study plan.
- followUpQuestions: 1-3 sharper interview-style follow-ups a real interviewer would ask next, based on gaps or claims made in the answer.
- exampleAnswer: a concise example answer (max 300 characters) demonstrating a strong response to the question, role-specific.`,
      prompt: `Focus area: ${data.focusArea ?? "n/a"}

Job description:
"""${(data.jobDescription ?? "").slice(0, 4000)}"""

JD analysis:
${JSON.stringify(data.jdAnalysis ?? null)}

Candidate background:
${JSON.stringify(data.resumeAnalysis ?? null)}

Interview question:
${data.question}

Candidate answer:
"""${data.answer}"""`,
      experimental_output: Output.object({ schema: EvalSchema }),
    });

    return result.experimental_output;
  });

// ---------- Plan refinement based on answer performance ----------

const RefineInput = z.object({
  jobDescription: z.string().min(10).max(10000),
  jdAnalysis: JdSchema.nullable(),
  resumeAnalysis: ResumeSchema.nullable(),
  experienceLevel: z.enum(["beginner", "intermediate", "experienced"]),
  hoursPerDay: z.number().min(1).max(12),
  startDate: z.string(),
  remainingDays: z.number().int().min(1).max(60),
  currentPlan: z.array(PlanDaySchema).max(60),
  answerHistory: z.array(z.object({
    question: z.string(),
    score: z.number(),
    weakAreas: z.array(z.string()),
    focusArea: z.string().optional(),
  })).max(200),
});

export const refinePlan = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => RefineInput.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    if (!key) throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY");
    const gateway = createGeminiProvider(key);

    const aggregatedWeakAreas = Array.from(
      new Set(data.answerHistory.flatMap((a) => a.weakAreas))
    ).slice(0, 30);
    const avgScore = data.answerHistory.length
      ? (data.answerHistory.reduce((s, a) => s + a.score, 0) / data.answerHistory.length).toFixed(1)
      : "n/a";

    const result = await generateText({
      model: gateway("gemini-3.1-flash-lite"),
      system: `You are an interview coach revising a candidate's remaining study plan based on how they actually performed on practice questions.

Rules:
- Return exactly ${data.remainingDays} entries in "plan", one per day, starting on ${data.startDate} (YYYY-MM-DD, incrementing daily).
- Each estimatedHours <= ${data.hoursPerDay}.
- Aggressively prioritize the aggregated weakAreas below — the weaker the past answers, the more days you spend re-drilling those gaps with fresh angles and harder follow-ups.
- Keep topics/activities specific to THIS role. Include a mock interview day near the end if remainingDays >= 3, and a light review on the final day.
- questions: 3-5 targeted interview questions per day that directly probe the identified weak areas (or the day's focus).
- Do NOT repeat identical questions the candidate already answered.`,
      prompt: `startDate: ${data.startDate}
remainingDays: ${data.remainingDays}
hoursPerDay: ${data.hoursPerDay}
experienceLevel: ${data.experienceLevel}
avgScore: ${avgScore}

Aggregated weak areas from past answers (prioritize these):
${aggregatedWeakAreas.join(", ") || "(none yet)"}

Recent answered questions (avoid duplicating):
${data.answerHistory.slice(-20).map((a) => `- [${a.score}/10] ${a.question}`).join("\n")}

Job description:
"""${data.jobDescription.slice(0, 5000)}"""

JD analysis:
${JSON.stringify(data.jdAnalysis)}

Resume analysis:
${JSON.stringify(data.resumeAnalysis)}`,
      experimental_output: Output.object({ schema: PlanSchema }),
    });

    return result.experimental_output.plan;
  });

// ---------- Persistence (signed-in users only) ----------

const TaskAnswerSchema = z.object({
  question: z.string(),
  answer: z.string(),
  score: z.number(),
  feedback: z.string(),
  weakAreas: z.array(z.string()),
  followUpQuestions: z.array(z.string()),
  exampleAnswer: z.string().nullable().optional(),
  answeredAt: z.string(),
});

const PrepStateSchema = z.object({
  resumeText: z.string(),
  resumeAnalysis: z.union([ResumeSchema, z.null()]),
  jobDescription: z.string(),
  jdAnalysis: z.union([JdSchema, z.null()]),
  interviewDate: z.union([z.string(), z.null()]).optional(),
  plan: z.array(PlanDaySchema),
  completed: z.array(z.string()),
  answers: z.record(z.string(), z.array(TaskAnswerSchema)).optional(),
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
        answers: data.answers ?? {},
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
      .select("resume_text, resume_analysis, job_description, jd_analysis, interview_date, plan, completed, answers")
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
      answers: ((data as { answers?: unknown }).answers as Record<string, z.infer<typeof TaskAnswerSchema>[]> | null) ?? {},
    };
  });

