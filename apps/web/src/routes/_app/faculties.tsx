import { createFileRoute, redirect } from "@tanstack/react-router";

// Preserve old bookmarks without exposing the retired faculty screen.
export const Route = createFileRoute("/_app/faculties")({
  beforeLoad: () => {
    throw redirect({ to: "/departments" });
  },
});
