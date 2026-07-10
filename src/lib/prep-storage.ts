// Shared prep types + localStorage helpers.
// Signed-in users mirror to Supabase via prep.functions.ts.

export type ResumeAnalysis = {
  yearsExperience: number;
  skills: string[];
  weakAreas: string[];
  summary: string;
};

export type JdAnalysis = {
  missingSkills: string[];
  likelyQuestions: string[];
  topicsToReview: string[];
  matchScore: number; // 0-100
  summary: string;
};

export type TopicId = "api" | "sql" | "playwright" | "mock" | "review";

export type PlanDay = {
  date: string; // ISO date
  topic: TopicId;
  focus: string; // short description of what to study
  drills: string[]; // 2-4 concrete actions
};

export type PrepState = {
  resumeText: string;
  resumeAnalysis: ResumeAnalysis | null;
  jobDescription: string;
  jdAnalysis: JdAnalysis | null;
  interviewDate: string | null; // ISO date
  plan: PlanDay[];
  completed: string[]; // ISO dates marked done
};

export const EMPTY_PREP: PrepState = {
  resumeText: "",
  resumeAnalysis: null,
  jobDescription: "",
  jdAnalysis: null,
  interviewDate: null,
  plan: [],
  completed: [],
};

const KEY = "qa.repl.prep.v1";

export function loadPrepLocal(): PrepState {
  if (typeof window === "undefined") return EMPTY_PREP;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY_PREP;
    return { ...EMPTY_PREP, ...JSON.parse(raw) };
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
