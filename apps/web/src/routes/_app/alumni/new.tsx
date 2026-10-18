import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlumniCreateDialog } from "@/components/alumni-create-dialog";

export const Route = createFileRoute("/_app/alumni/new")({ component: NewAlumniPage });

function NewAlumniPage() {
  const navigate = useNavigate();
  return (
    <AlumniCreateDialog
      onClose={() => {
        void navigate({ to: "/alumni" });
      }}
    />
  );
}
