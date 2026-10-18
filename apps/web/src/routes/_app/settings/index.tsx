import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { toast } from "sonner";
import {
  FormCard,
  FormField,
  PageHeader,
  PageShell,
  PrimaryButton,
} from "@/components/page-header";
import { ModeToggle } from "@/components/mode-toggle";
import { useSession } from "@/lib/session";
import { client, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_app/settings/")({ component: AccountSettings });

function AccountSettings() {
  const session = useSession();
  const [name, setName] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const profile = useMutation({
    mutationFn: () => client.auth.updateProfile({ name: name ?? session.data?.name ?? "" }),
    onSuccess: async () => {
      toast.success("Account updated");
      await queryClient.invalidateQueries();
      setName(null);
    },
    onError: (error) => toast.error(error.message),
  });
  const changePassword = useMutation({
    mutationFn: () => client.auth.changePassword({ currentPassword, password }),
    onSuccess: () => {
      setPassword("");
      setCurrentPassword("");
      toast.success("Password changed. Other sessions have been signed out.");
    },
    onError: (error) => toast.error(error.message),
  });
  return (
    <PageShell>
      <PageHeader
        title="Account settings"
        description="Manage your account, password and appearance."
      />
      <FormCard title="Profile" description={session.data?.email}>
        <form
          className="flex max-w-lg flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            profile.mutate();
          }}
        >
          <FormField id="account-name" label="Full name" required>
            <Input
              id="account-name"
              autoComplete="name"
              required
              maxLength={120}
              value={name ?? session.data?.name ?? ""}
              onChange={(event) => setName(event.target.value)}
            />
          </FormField>
          {profile.isError ? <p role="alert">{profile.error.message}</p> : null}
          <PrimaryButton
            type="submit"
            pending={profile.isPending}
            disabled={name === null || name === session.data?.name}
          >
            Save profile
          </PrimaryButton>
        </form>
      </FormCard>
      <FormCard
        title="Password"
        description="Enter your current password. A successful change signs out your other sessions."
      >
        <form
          className="flex max-w-lg flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            changePassword.mutate();
          }}
        >
          <FormField id="current-password" label="Current password" required>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
            />
          </FormField>
          <FormField id="new-password" label="New password" required>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </FormField>
          {changePassword.isError ? <p role="alert">{changePassword.error.message}</p> : null}
          <PrimaryButton type="submit" pending={changePassword.isPending}>
            Change password
          </PrimaryButton>
        </form>
      </FormCard>
      <FormCard title="Appearance">
        <ModeToggle />
      </FormCard>
    </PageShell>
  );
}
