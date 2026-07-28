import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { Briefcase, FileText, Calendar, Check } from "lucide-react";

export const Route = createFileRoute("/prep")({
  head: () => ({
    meta: [
      { title: "Interview prep — AI Interview Coach" },
      { name: "description", content: "Paste any job description, share your background, and get a personalized study schedule for your interview." },
    ],
  }),
  component: PrepLayout,
});

const STEPS = [
  { to: "/prep/jd", label: "Job & setup", short: "1", icon: Briefcase },
  { to: "/prep/resume", label: "Resume (optional)", short: "2", icon: FileText },
  { to: "/prep/plan", label: "Your plan", short: "3", icon: Calendar },
] as const;

function PrepLayout() {
  const { pathname } = useLocation();
  const activeIdx = STEPS.findIndex((s) => pathname.startsWith(s.to));
  const isDashboard = pathname === "/prep" || pathname === "/prep/" || pathname === "/prep/today";

  return (
    <main className={`mx-auto px-6 py-10 ${isDashboard ? "max-w-6xl" : "max-w-4xl"}`}>
      {!isDashboard && (
        <ol className="mb-10 flex items-center gap-2 sm:gap-4">
          {STEPS.map((s, i) => {
            const done = i < activeIdx;
            const active = i === activeIdx;
            return (
              <li key={s.to} className="flex flex-1 items-center gap-2">
                <Link
                  to={s.to}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    active
                      ? "border-foreground bg-foreground text-background"
                      : done
                        ? "border-terminal/40 bg-terminal/10 text-terminal"
                        : "border-border bg-background text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[10px] font-semibold">
                    {done ? <Check className="h-3 w-3" /> : s.short}
                  </span>
                  <span className="hidden sm:inline">{s.label}</span>
                </Link>
                {i < STEPS.length - 1 && (
                  <div className={`h-px flex-1 ${i < activeIdx ? "bg-terminal/40" : "bg-border"}`} />
                )}
              </li>
            );
          })}
        </ol>
      )}

      <Outlet />
    </main>
  );
}
