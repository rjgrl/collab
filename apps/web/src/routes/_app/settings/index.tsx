import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Card, CardContent } from "@Alumni-Tracking-Ss/ui/components/card";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { toast } from "sonner";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { PageHeader, PageShell } from "@/components/layout/page";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { useSession } from "@/lib/session";
import { PasswordChecklist } from "@/components/forms/password-checklist";
import {
  isPasswordScreeningMessage,
  passwordMeetsPolicy,
} from "@Alumni-Tracking-Ss/contracts/password-policy";
import { EmailVerification } from "@/components/account/email-verification";
import { NameFields, nameDraft, type NameDraft } from "@/components/forms/name-fields";
import {
  AccountProfileFields,
  type AccountProfile,
} from "@/components/forms/account-profile-fields";
import { updateProfileSchema } from "@Alumni-Tracking-Ss/contracts/auth";
import { api, client, queryClient } from "@/lib/api";
import { AccountPhotoControls } from "@/components/account/account-photo-controls";
import { AccountAvatar } from "@/components/account/account-avatar";
import { EmailChange } from "@/components/account/email-change";
import { DetailRow, SummaryCard } from "@/components/account/summary-card";

export const Route = createFileRoute("/_app/settings/")({ component: AccountSettings });

type AccountDialog = "personal" | "contact" | "password" | "photo" | null;

function valueOrDash(value?: string | null) {
  return value?.trim() || "—";
}

function AccountSettings() {
  const session = useSession();
  const verification = useQuery(api.auth.verificationStatus.queryOptions());
  const [dialog, setDialog] = useState<AccountDialog>(null);
  const [names, setNames] = useState<NameDraft>(() => nameDraft(session.data));
  const [contact, setContact] = useState<AccountProfile>({
    phoneNumber: "",
    gender: "",
    facebookAccount: "",
  });
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const savedContact: AccountProfile = {
    phoneNumber: verification.data?.phoneNumber ?? "",
    gender: verification.data?.gender ?? "",
    facebookAccount: verification.data?.facebookAccount ?? "",
  };
  const openProfileDialog = (next: "personal" | "contact") => {
    setNames(nameDraft(session.data));
    setContact(savedContact);
    setDialog(next);
  };
  const profile = useMutation({
    mutationFn: () =>
      client.auth.updateProfile(
        updateProfileSchema.parse(
          dialog === "personal"
            ? {
                ...names,
                gender: contact.gender,
                facebookAccount: contact.facebookAccount,
              }
            : { ...names, ...contact },
        ),
      ),
    onSuccess: async () => {
      toast.success("Account updated");
      setDialog(null);
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });
  const changePassword = useMutation({
    mutationFn: () => client.auth.changePassword({ currentPassword, password }),
    onSuccess: () => {
      setPassword("");
      setCurrentPassword("");
      setDialog(null);
      toast.success("Password changed. Other sessions have been signed out.");
    },
    onError: (error) => {
      if (!isPasswordScreeningMessage(error.message)) toast.error(error.message);
    },
  });
  const screeningError =
    changePassword.error && isPasswordScreeningMessage(changePassword.error.message)
      ? changePassword.error.message
      : null;
  const roles = session.data?.roles.map((role) => role.replaceAll(/[-_]/g, " ")).join(", ");
  const authenticator = session.data?.mfaEnrolled ? "Enabled" : "Not set up";

  return (
    <PageShell>
      <PageHeader
        title="Account"
        description="Review your details and change only what you need."
      />

      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex min-w-0 flex-1 items-center gap-4">
            <AccountAvatar
              image={session.data?.image}
              name={session.data?.name ?? "Account"}
              className="size-20"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold tracking-tight">{session.data?.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                <span className="break-words">{session.data?.email}</span>
                <EmailVerification />
              </div>
              <p className="mt-1 text-sm capitalize text-muted-foreground">{valueOrDash(roles)}</p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => setDialog("photo")}
          >
            <Camera className="size-4" />
            Change photo
          </Button>
        </CardContent>
      </Card>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <SummaryCard
          title="Personal details"
          actionLabel="Edit"
          actionDisabled={!verification.data}
          onAction={() => openProfileDialog("personal")}
        >
          <DetailRow label="First name" value={valueOrDash(session.data?.firstName)} />
          <DetailRow label="Middle name" value={valueOrDash(session.data?.middleName)} />
          <DetailRow label="Last name" value={valueOrDash(session.data?.lastName)} />
          <DetailRow label="Suffix" value={valueOrDash(session.data?.suffix)} />
          <DetailRow label="Gender" value={valueOrDash(verification.data?.gender)} />
        </SummaryCard>

        <SummaryCard
          title="Contact"
          actionLabel="Edit contact"
          actionDisabled={!verification.data}
          onAction={() => openProfileDialog("contact")}
        >
          <DetailRow label="Email" value={session.data?.email ?? "—"} action={<EmailChange />} />
          <DetailRow label="Phone" value={valueOrDash(verification.data?.phoneNumber)} />
          <DetailRow label="Facebook" value={valueOrDash(verification.data?.facebookAccount)} />
        </SummaryCard>

        <div className="lg:col-span-2">
          <SummaryCard title="Sign-in & security">
            <DetailRow
              label="Password"
              value="Set"
              action={
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  onClick={() => {
                    changePassword.reset();
                    setCurrentPassword("");
                    setPassword("");
                    setDialog("password");
                  }}
                >
                  Change password
                </Button>
              }
            />
            <DetailRow
              label="Authenticator"
              value={authenticator}
              action={
                <Link
                  to="/security"
                  className="inline-flex min-h-8 items-center text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  Manage authenticator
                </Link>
              }
            />
          </SummaryCard>
        </div>
      </div>

      {dialog === "photo" ? (
        <FormDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          title="Change profile photo"
          description="Choose a clear photo shown with your account and alumni profile."
        >
          <section aria-label="Profile photo">
            <AccountPhotoControls
              image={session.data?.image}
              name={session.data?.name ?? "Account"}
            />
          </section>
        </FormDialog>
      ) : null}

      {dialog === "personal" ? (
        <FormDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          pending={profile.isPending}
          title="Edit personal details"
          description="Update your name or gender."
        >
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              profile.mutate();
            }}
          >
            {!session.data?.firstName || !session.data.lastName ? (
              <p className="text-sm text-muted-foreground sm:col-span-2">
                Current display name: {session.data?.name}. Confirm the separate name fields below.
              </p>
            ) : null}
            <NameFields value={names} onChange={setNames} prefix="account" />
            <AccountProfileFields
              value={contact}
              onChange={setContact}
              showPhone={false}
              showFacebook={false}
            />
            {profile.isError ? (
              <ErrorAlert className="sm:col-span-2">{profile.error.message}</ErrorAlert>
            ) : null}
            <PrimaryButton type="submit" pending={profile.isPending}>
              Save personal details
            </PrimaryButton>
          </form>
        </FormDialog>
      ) : null}

      {dialog === "contact" ? (
        <FormDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          pending={profile.isPending}
          title="Edit contact details"
          description="Changing your phone number clears its verification."
        >
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              profile.mutate();
            }}
          >
            <AccountProfileFields value={contact} onChange={setContact} showGender={false} />
            {verification.isError ? <ErrorAlert>{verification.error.message}</ErrorAlert> : null}
            {profile.isError ? <ErrorAlert>{profile.error.message}</ErrorAlert> : null}
            <PrimaryButton type="submit" pending={profile.isPending}>
              Save contact details
            </PrimaryButton>
          </form>
        </FormDialog>
      ) : null}

      {dialog === "password" ? (
        <FormDialog
          open
          onOpenChange={(open) => !open && setDialog(null)}
          pending={changePassword.isPending}
          title="Change password"
          description="A successful change signs out your other sessions."
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
                onChange={(event) => {
                  setPassword(event.target.value);
                  if (screeningError) changePassword.reset();
                }}
              />
            </FormField>
            <PasswordChecklist
              id="account-password-guidance"
              value={password}
              serverError={screeningError}
            />
            {changePassword.isError && !screeningError ? (
              <ErrorAlert>{changePassword.error.message}</ErrorAlert>
            ) : null}
            <PrimaryButton
              type="submit"
              pending={changePassword.isPending}
              disabled={!passwordMeetsPolicy(password)}
            >
              Change password
            </PrimaryButton>
          </form>
        </FormDialog>
      ) : null}
    </PageShell>
  );
}
