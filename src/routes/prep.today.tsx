import { createFileRoute } from "@tanstack/react-router";
import { TodayPrepExperience } from "@/components/prep/TodayPrepExperience";

export const Route = createFileRoute("/prep/today")({
  head: () => ({
    meta: [
      { title: "Today's Prep — PrepPilotX" },
      {
        name: "description",
        content:
          "Your daily interview preparation workspace with prioritized tasks and roadmap context.",
      },
    ],
  }),
  component: TodayPrepExperience,
});
