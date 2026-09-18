import { createServerFn } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { z } from "zod";

export const JobDateRangeSchema = z.enum(["any", "1", "3", "7", "14"]);
export const JobRemoteFilterSchema = z.enum(["any", "remote", "onsite", "hybrid"]);
export const JobTypeFilterSchema = z.enum(["any", "full_time", "part_time", "contract", "temporary", "internship"]);
export const JobSortBySchema = z.enum(["relevance", "date", "salary"]);

const SearchJobsInput = z.object({
  what: z.string().trim().min(1).max(200),
  where: z.string().trim().max(200).default(""),
  country: z.string().trim().min(2).max(4).default("us"),
  remote: JobRemoteFilterSchema.default("any"),
  dateRange: JobDateRangeSchema.default("any"),
  jobType: JobTypeFilterSchema.default("any"),
  salaryMin: z.coerce.number().min(0).max(1_000_000).optional().nullable(),
  sortBy: JobSortBySchema.default("relevance"),
  page: z.coerce.number().int().min(1).max(10).default(1),
  perPage: z.coerce.number().int().min(5).max(50).default(25),
});

export type JobDateRange = z.infer<typeof JobDateRangeSchema>;
export type JobRemoteFilter = z.infer<typeof JobRemoteFilterSchema>;
export type JobTypeFilter = z.infer<typeof JobTypeFilterSchema>;
export type JobSortBy = z.infer<typeof JobSortBySchema>;

export type JobSearchResult = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  fullDescription?: string;
  url: string;
  salaryMin: number | null;
  salaryMax: number | null;
  created: string;
  jobType: string;
  remote: "remote" | "onsite" | "hybrid" | "unknown";
  category: string;
  source: string;
  skills: string[];
  preferredSkills: string[];
  requirements: string[];
  qualifications: string[];
};

const DAY_MS = 24 * 60 * 60 * 1000;

function normalizeText(value: unknown) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim();
}

function normalizeLocation(value: unknown): string {
  return normalizeText(
    typeof value === "string"
      ? value
      : value && typeof value === "object" && "display_name" in value && typeof value.display_name === "string"
        ? value.display_name
        : "Remote",
  );
}

function inferRemoteStatus(raw: Record<string, unknown>, locationString: string, description: string): JobSearchResult["remote"] {
  const haystack = `${locationString} ${description}`.toLowerCase();
  if (/(remote|work from home|distributed|telecommute|home office)/i.test(haystack)) return "remote";
  if (/(hybrid|blended|onsite.*remote|remote.*onsite)/i.test(haystack)) return "hybrid";
  if (raw.is_remote === true || raw.remote === true || raw.location_type === "remote") return "remote";
  return "unknown";
}

function parseJobType(raw: Record<string, unknown>): string {
  const fromContract = normalizeText(raw.contract_type ?? raw.contract ?? raw.job_type);
  const fromTypical = normalizeText(raw.contract_type ?? raw.contract ?? raw.contract_time);
  const direct = [fromContract, fromTypical].find(Boolean);
  if (!direct) return "unknown";
  const value = direct.toLowerCase();
  if (value.includes("full")) return "Full-time";
  if (value.includes("part")) return "Part-time";
  if (value.includes("contract")) return "Contract";
  if (value.includes("temporary")) return "Temporary";
  if (value.includes("intern")) return "Internship";
  return direct;
}

function parseCreated(raw: unknown): string {
  if (typeof raw === "string" && raw) return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return new Date(raw).toISOString();
  }
  return new Date().toISOString();
}

function parseSkills(rawDescription: string, rawTitle: string): string[] {
  const base = `${rawTitle} ${rawDescription}`;
  const skillKeywords = [
    "Java", "JavaScript", "TypeScript", "Python", "C#", "C++", "Go", "Ruby", "SQL", "PostgreSQL", "MySQL",
    "MongoDB", "Redis", "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "CI/CD", "Jenkins",
    "GitHub", "Playwright", "Selenium", "Cypress", "REST API", "REST APIs", "API Testing", "Postman",
    "React", "Node.js", "Angular", "Vue", "QA Automation", "Automation", "SDET", "Manual Testing",
    "Test Automation", "Agile", "Scrum", "DevOps", "Linux", "Microservices", "System Design", "SQL Server",
    "Snowflake", "Power BI", "Tableau", "ETL", "Kafka", "GitLab"
  ];

  const normalized = skillKeywords.filter((skill) => {
    const lower = skill.toLowerCase();
    const needle = lower.replace(/\s+/g, "");
    const haystack = base.toLowerCase().replace(/\s+/g, "");
    return haystack.includes(needle) || haystack.includes(lower.replace(/\./g, ""));
  });

  return [...new Set(normalized)].slice(0, 12);
}

function normalizeJob(raw: Record<string, unknown>): JobSearchResult {
  const title = normalizeText(raw.title) || "Untitled role";
  const company =
    typeof raw.company === "string"
      ? raw.company
      : raw.company && typeof raw.company === "object" && "display_name" in raw.company && typeof raw.company.display_name === "string"
        ? raw.company.display_name
        : "Unknown company";
  const location = normalizeLocation(raw.location);
  const description = normalizeText(raw.description) || "";
  const created = parseCreated(raw.created);
  const remote = inferRemoteStatus(raw, location, description);
  const jobType = parseJobType(raw);
  const category = normalizeText(raw.category && typeof raw.category === "object" && "label" in raw.category ? raw.category.label : raw.category);
  const salaryMin = typeof raw.salary_min === "number" ? raw.salary_min : null;
  const salaryMax = typeof raw.salary_max === "number" ? raw.salary_max : null;
  const skills = parseSkills(description, title);

  return {
    id: String(raw.id ?? `${title}-${Math.random().toString(36).slice(2, 10)}`),
    title,
    company,
    location,
    description,
    fullDescription: description,
    url: normalizeText(raw.redirect_url ?? raw.url ?? ""),
    salaryMin,
    salaryMax,
    created,
    jobType,
    remote,
    category: category || "General",
    source: "Adzuna",
    skills,
    preferredSkills: [],
    requirements: [],
    qualifications: [],
  };
}

function applyLocalFilters(jobs: JobSearchResult[], filters: { remote: JobRemoteFilter; dateRange: JobDateRange; jobType: JobTypeFilter; salaryMin: number | null; sortBy: JobSortBy }) {
  let next = [...jobs];

  if (filters.remote !== "any") {
    next = next.filter((job) => job.remote === filters.remote);
  }

  if (filters.jobType !== "any") {
    next = next.filter((job) => {
      if (!job.jobType || job.jobType === "unknown") return false;
      return job.jobType.toLowerCase().includes(filters.jobType.replace("_", "-"));
    });
  }

  if (filters.salaryMin != null) {
    next = next.filter((job) => {
      if (job.salaryMin == null && job.salaryMax == null) return false;
      const base = job.salaryMin ?? job.salaryMax ?? 0;
      return base >= filters.salaryMin;
    });
  }

  if (filters.dateRange !== "any") {
    const days = Number(filters.dateRange);
    const cutoff = Date.now() - days * DAY_MS;
    next = next.filter((job) => {
      const created = new Date(job.created).getTime();
      return Number.isFinite(created) ? created >= cutoff : true;
    });
  }

  if (filters.sortBy === "salary") {
    next.sort((a, b) => (b.salaryMax ?? b.salaryMin ?? 0) - (a.salaryMax ?? a.salaryMin ?? 0));
  } else if (filters.sortBy === "date") {
    next.sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
  }

  return next;
}

const SearchJobDetailInput = z.object({
  country: z.string().trim().min(2).max(4).default("us"),
  jobId: z.string().trim().min(1).max(200),
});

export const getJobById = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data: unknown) => SearchJobDetailInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;
    if (!appId || !appKey) {
      throw new Error("Missing Adzuna config: ADZUNA_APP_ID and ADZUNA_APP_KEY");
    }

    const url = `https://api.adzuna.com/v1/api/jobs/${data.country}/details/${data.jobId}?app_id=${appId}&app_key=${appKey}`;
    const response = await fetch(url, { headers: { Accept: "application/json" } });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Adzuna job details failed (${response.status}): ${body.slice(0, 250)}`);
    }

    const json = (await response.json()) as Record<string, unknown>;
    return normalizeJob((json as Record<string, unknown>) ?? {});
  });

export const searchJobs = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth])
  .inputValidator((data: unknown) => SearchJobsInput.parse(data ?? {}))
  .handler(async ({ data }) => {
    const appId = process.env.ADZUNA_APP_ID;
    const appKey = process.env.ADZUNA_APP_KEY;

    if (!appId || !appKey) {
      throw new Error("Missing Adzuna config: ADZUNA_APP_ID and ADZUNA_APP_KEY");
    }

    const country = data.country.trim() || "us";
    const what = data.what.trim();
    const where = data.where.trim();
    const params = new URLSearchParams({
      app_id: appId,
      app_key: appKey,
      what,
      results_per_page: String(data.perPage),
    });

    if (where) params.set("where", where);
    if (data.salaryMin != null && Number.isFinite(data.salaryMin)) params.set("salary_min", String(data.salaryMin));
    if (data.dateRange && data.dateRange !== "any") params.set("max_days_old", String(data.dateRange));
    if (data.sortBy && data.sortBy !== "relevance") params.set("sort_by", data.sortBy);
    if (data.jobType !== "any") {
      if (data.jobType === "full_time") params.set("full_time", "1");
      if (data.jobType === "part_time") params.set("part_time", "1");
      if (data.jobType === "contract") params.set("contract", "1");
      if (data.jobType === "temporary") params.set("temporary", "1");
      if (data.jobType === "internship") params.set("internship", "1");
    }

    const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${data.page}?${params.toString()}`;
    const safeQuery = Object.fromEntries([...params.entries()].filter(([key]) => key !== "app_key"));
    console.log("[Adzuna] endpoint", url.replace(appKey, "[HIDDEN]"));
    console.log("[Adzuna] query params", safeQuery);
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Adzuna search failed (${response.status}): ${body.slice(0, 300)}`);
    }

    const json = (await response.json()) as {
      results?: Array<Record<string, unknown>>;
    };

    const jobs = (json.results ?? []).map((job) => normalizeJob(job));
    const filtered = applyLocalFilters(jobs, {
      remote: data.remote,
      dateRange: data.dateRange,
      jobType: data.jobType,
      salaryMin: data.salaryMin ?? null,
      sortBy: data.sortBy,
    });

    return filtered;
  });
