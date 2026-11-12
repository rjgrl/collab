import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/alumni/new")({
  beforeLoad: () => {
    throw redirect({ to: "/alumni" });
  },
});
