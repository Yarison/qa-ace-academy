import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/prep/")({
  beforeLoad: () => {
    throw redirect({ to: "/prep/jd" });
  },
});
