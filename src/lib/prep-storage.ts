// Shared prep types + localStorage helpers.
// Signed-in users mirror to Supabase via prep.functions.ts.

export type ResumeAnalysis = {
  yearsExperience: number;
  skills: string[];
  weakAreas: string[];
  summary: string;
};

export type JdAnalysis = {
  technicalSkills: string[];
  softSkills: string[];
  toolsAndTechnologies: string[];
  industryKnowledge: string[];
  certifications: string[];
  keywordsAndCompetencies: string[];
  likelyQuestions: string[];
  matchScore: number | null; // null when no resume provided
  summary: string;
};

export type ExperienceLevel = "beginner" | "intermediate" | "experienced";

export type Preferences = {
  interviewDate: string | null; // ISO date
  daysUntil: number | null; // alternative to date
  hoursPerDay: number; // 1-12
  experienceLevel: ExperienceLevel;
};

export type PlanDay = {
  date: string; // ISO date
  focusArea: string; // e.g. "Technical skills", "Behavioral", "Company research"
  topics: string[];
  activities: string[]; // concrete tasks
  estimatedHours: number;
  questions?: string[]; // interview-style questions to practice this day
};

export type TaskAnswer = {
  question: string;
  answer: string;
  score: number; // 0-10
  feedback: string;
  weakAreas: string[];
  followUpQuestions: string[];
  answeredAt: string; // ISO datetime
  exampleAnswer?: string | null; //example answer demonstrating a strong response to the question
};

export type PrepState = {
  resumeText: string;
  resumeAnalysis: ResumeAnalysis | null;
  jobDescription: string;
  jdAnalysis: JdAnalysis | null;
  preferences: Preferences;
  plan: PlanDay[];
  completed: string[]; // ISO dates marked done
  answers: Record<string, TaskAnswer[]>; // keyed by day ISO date
};

export const EMPTY_PREP: PrepState = {
  resumeText: "",
  resumeAnalysis: null,
  jobDescription: "",
  jdAnalysis: null,
  preferences: {
    interviewDate: null,
    daysUntil: null,
    hoursPerDay: 2,
    experienceLevel: "intermediate",
  },
  plan: [],
  completed: [],
  answers: {},
};


const KEY = "ai.prep.v2";

export function loadPrepLocal(): PrepState {
  if (typeof window === "undefined") return EMPTY_PREP;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_PREP;
    const parsed = JSON.parse(raw);
    return {
      ...EMPTY_PREP,
      ...parsed,
      preferences: { ...EMPTY_PREP.preferences, ...(parsed.preferences ?? {}) },
      answers: (parsed.answers && typeof parsed.answers === "object") ? parsed.answers : {},
    };
  } catch {

    return EMPTY_PREP;
  }
}

export function savePrepLocal(state: PrepState) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearPrepLocal() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function daysBetween(fromISO: string, toISO: string): number {
  const a = new Date(fromISO + "T00:00:00").getTime();
  const b = new Date(toISO + "T00:00:00").getTime();
  return Math.round((b - a) / 86400000);
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function resolveDaysUntil(prefs: Preferences): number | null {
  if (prefs.daysUntil && prefs.daysUntil >= 1) return Math.min(60, Math.floor(prefs.daysUntil));
  if (prefs.interviewDate) {
    const d = daysBetween(todayISO(), prefs.interviewDate);
    if (d >= 1) return Math.min(60, d);
  }
  return null;
}
