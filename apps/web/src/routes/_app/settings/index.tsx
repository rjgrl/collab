import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
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
import { useSession } from "@/lib/session";
import { PasswordGuidance } from "@/components/password-guidance";
import { EmailVerification } from "@/components/email-verification";
import { NameFields, nameDraft, type NameDraft } from "@/components/name-fields";
import { AccountProfileFields, type AccountProfile } from "@/components/account-profile-fields";
import { updateProfileSchema } from "@Alumni-Tracking-Ss/contracts/auth";
import { api, client, queryClient } from "@/utils/api";
import { AccountPhotoControls } from "@/components/account-photo-controls";
import { EmailChange } from "@/components/email-change";

export const Route = createFileRoute("/_app/settings/")({ component: AccountSettings });

function AccountSettings() {
  const session = useSession();
  const verification = useQuery(api.auth.verificationStatus.queryOptions());
  const [names, setNames] = useState<NameDraft | null>(null);
  const [contact, setContact] = useState<AccountProfile | null>(null);
  const currentContact = contact ?? {
    phoneNumber: verification.data?.phoneNumber ?? "",
    gender: verification.data?.gender ?? "",
    facebookAccount: verification.data?.facebookAccount ?? "",
  };
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const profile = useMutation({
    mutationFn: () =>
      client.auth.updateProfile(
        updateProfileSchema.parse({
          ...(names ?? nameDraft(session.data)),
          ...currentContact,
        }),
      ),
    onSuccess: async () => {
      toast.success("Account updated");
      await queryClient.invalidateQueries();
      setNames(null);
      setContact(null);
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
        description="Manage your personal details and account security."
      />
      {session.data?.mfaRequired || session.data?.mfaEnrolled ? (
        <Link
          className="w-fit rounded-lg border px-4 py-3 text-sm font-medium underline-offset-4 hover:bg-muted hover:underline"
          to="/security"
        >
          Manage authenticator and recovery codes
        </Link>
      ) : (
        <p className="text-sm text-muted-foreground">
          Authenticator verification is optional for this account.
        </p>
      )}
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-6">
          <FormCard
            title="Personal details"
            description={
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="break-all">{session.data?.email}</span>
                <EmailVerification />
                <EmailChange />
              </div>
            }
          >
            <section aria-label="Profile photo" className="mb-5 border-b pb-5">
              <AccountPhotoControls
                image={session.data?.image}
                name={session.data?.name ?? "Account"}
              />
            </section>
            <form
              className="grid gap-4 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                profile.mutate();
              }}
            >
              {!session.data?.firstName || !session.data.lastName ? (
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  Current display name: {session.data?.name}. Confirm the separate name fields below
                  when you are ready.
                </p>
              ) : null}
              <NameFields
                value={names ?? nameDraft(session.data)}
                onChange={setNames}
                prefix="account"
              />
              <AccountProfileFields value={currentContact} onChange={setContact} />
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Changing your phone number clears its verification. Confirm the new number when
                required.
              </p>
              {verification.isError ? <p role="alert">{verification.error.message}</p> : null}
              {profile.isError ? <p role="alert">{profile.error.message}</p> : null}
              <PrimaryButton
                type="submit"
                pending={profile.isPending}
                disabled={!verification.data || (names === null && contact === null)}
              >
                Save personal details
              </PrimaryButton>
            </form>
          </FormCard>
        </div>
        <FormCard
          title="Password"
          description="Enter your current password. A successful change signs out your other sessions."
        >
          <form
            className="flex flex-col gap-4"
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
                aria-describedby="account-password-guidance"
                type="password"
                autoComplete="new-password"
                required
                minLength={15}
                maxLength={256}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
            {changePassword.isError ? <p role="alert">{changePassword.error.message}</p> : null}
            <PasswordGuidance id="account-password-guidance" value={password} />
            <PrimaryButton type="submit" pending={changePassword.isPending}>
              Change password
            </PrimaryButton>
          </form>
        </FormCard>
      </div>
    </PageShell>
  );
}
