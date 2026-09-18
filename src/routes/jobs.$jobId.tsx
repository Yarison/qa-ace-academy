import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Briefcase, Building2, Calendar, FileText, Loader2, MapPin, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { getJobById, type JobSearchResult } from "@/lib/jobs.functions";
import { generateResume, loadPrep, savePrep } from "@/lib/prep.functions";
import { EMPTY_PREP, getActiveRoadmapLocal, loadPrepLocal, savePrepLocal, type PrepState } from "@/lib/prep-storage";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/jobs/$jobId")({
  component: JobDetailPage,
});

function formatSalary(min: number | null, max: number | null) {
  if (min == null && max == null) return null;
  const lower = min == null ? "" : `$${Math.round(min).toLocaleString()}`;
  const upper = max == null ? "" : `$${Math.round(max).toLocaleString()}`;
  if (!lower && upper) return `Up to ${upper}`;
  if (lower && !upper) return `From ${lower}`;
  if (lower === upper) return lower;
  return `${lower}–${upper}`;
}

function JobDetailPage() {
  const { jobId } = Route.useParams();
  const [job, setJob] = useState<JobSearchResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<PrepState>(EMPTY_PREP);
  const [signedIn, setSignedIn] = useState(false);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    async function init() {
      try {
        const cached = sessionStorage.getItem(`job-detail:${jobId}`);
        if (cached) {
          const parsed = JSON.parse(cached) as JobSearchResult;
          setJob(parsed);
        } else {
          const remote = await getJobById({ data: { country: "us", jobId } });
          setJob(remote);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not load job details");
      } finally {
        setLoading(false);
      }
    }

    const active = getActiveRoadmapLocal();
    const local = active.state ?? loadPrepLocal();
    setState(local);
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    void init();
  }, [jobId]);

  useEffect(() => {
    if (job) {
      sessionStorage.setItem(`job-detail:${jobId}`, JSON.stringify(job));
    }
  }, [job, jobId]);

  async function persist(next: PrepState) {
    savePrepLocal(next);
    setState(next);
    if (signedIn) {
      try {
        await savePrep({ data: { ...next, roadmapId: "roadmap-1", roadmapName: "Roadmap 1", roadmapColor: "terminal" } });
      } catch {
        /* ignore */
      }
    }
  }

  async function generateResumeForJob() {
    if (!job) return;
    if (!state.resumeText.trim()) {
      toast.error("Paste or upload your resume before generating a tailored version.");
      return;
    }

    setGenerating(true);
    try {
      const result = await generateResume({
        data: {
          jobDescription: job.fullDescription || job.description || `${job.title}\n${job.company}\n${job.location}`,
          resumeText: state.resumeText,
          resumeAnalysis: state.resumeAnalysis,
        },
      });

      const next: PrepState = {
        ...state,
        generatedResume: {
          summary: result.summary ?? "",
          experience: result.experience ?? [],
          skills: result.skills ?? [],
          education: result.education ?? [],
        },
      };
      await persist(next);
      toast.success("Tailored resume generated and saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Resume generation failed");
    } finally {
      setGenerating(false);
    }
  }

  const salary = useMemo(() => (job ? formatSalary(job.salaryMin, job.salaryMax) : null), [job]);

  if (loading) {
    return (
      <div className="surface mt-8 rounded-2xl border border-border p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading job details…
      </div>
    );
  }

  if (!job) {
    return (
      <div className="surface mt-8 rounded-2xl border border-border p-8 text-sm text-muted-foreground">
        Job not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="surface rounded-2xl border border-border p-6">
        <div className="flex items-center justify-between gap-3">
          <a href="/jobs" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to jobs
          </a>
          <Button variant="outline" onClick={generateResumeForJob} disabled={generating}>
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
            Generate tailored resume
          </Button>
        </div>

        <div className="mt-5 space-y-3">
          <p className="eyebrow">Job detail</p>
          <h1 className="display-2 mt-2">{job.title}</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2"><Building2 className="h-4 w-4" /> {job.company}</span>
            <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4" /> {job.location}</span>
            {job.jobType !== "unknown" && <span>{job.jobType}</span>}
            {salary && <span className="inline-flex items-center gap-2"><Sparkles className="h-4 w-4 text-terminal" /> {salary}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-2"><Calendar className="h-3.5 w-3.5" /> {new Date(job.created).toLocaleDateString()}</span>
            {job.remote !== "unknown" && <span className="capitalize">{job.remote}</span>}
            {job.url && (
              <a href={job.url} target="_blank" rel="noreferrer" className="text-terminal hover:underline">
                Original posting
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="surface rounded-2xl border border-border p-6">
        <p className="eyebrow">Description</p>
        <div className="mt-3 whitespace-pre-wrap text-sm leading-7 text-foreground">{job.description}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="surface rounded-2xl border border-border p-6">
          <p className="eyebrow">Required skills</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {job.skills.length ? job.skills.map((skill) => (
              <span key={skill} className="rounded-full border border-border bg-accent px-2 py-1 text-xs font-medium">{skill}</span>
            )) : <span className="text-sm text-muted-foreground">Skills could not be reliably extracted from this posting.</span>}
          </div>
        </div>

        <div className="surface rounded-2xl border border-border p-6">
          <p className="eyebrow">Qualifications</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {job.requirements.length ? job.requirements.map((item) => <li key={item}>• {item}</li>) : <li>Qualification details were not available in the source data.</li>}
          </ul>
        </div>
      </div>
    </div>
  );
}
