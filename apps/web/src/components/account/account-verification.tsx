import { completionProfileSchema } from "@Alumni-Tracking-Ss/contracts/auth";
import { AcademicProfileFields, emptyAcademic } from "@/components/forms/academic-profile-fields";
import { LocalVerificationNotice } from "@/components/layout/local-verification-notice";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { NameFields, emptyName, nameDraft } from "@/components/forms/name-fields";
import { AccountProfileFields } from "@/components/forms/account-profile-fields";
import { PasswordGuidance } from "@/components/forms/password-guidance";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { AuthHeader, AuthLayout } from "@/components/layout/auth-layout";
import { useSession } from "@/lib/session";
import { client, api, queryClient } from "@/lib/api";

export function AccountVerification() {
  const navigate = useNavigate();
  const account = useSession().data;
  const status = useQuery(api.auth.verificationStatus.queryOptions());
  const data = status.data;
  const [profile, setProfile] = useState({
    ...emptyName,
    phoneNumber: "",
    gender: "",
    facebookAccount: "",
  });
  const [editing, setEditing] = useState(false);
  const [academic, setAcademic] = useState(emptyAcademic);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [codes, setCodes] = useState({ email: "", phone: "" });
  const [sent, setSent] = useState({ email: false, phone: false });
  const [until, setUntil] = useState({ email: 0, phone: 0 });
  const [now, setNow] = useState(Date.now());
  const emailStarted = useRef(false);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (data)
      setProfile((current) => ({
        ...current,
        ...nameDraft(account),
        phoneNumber: data.phoneNumber,
        gender: data.gender,
        facebookAccount: data.facebookAccount,
      }));
  }, [
    data?.phoneNumber,
    data?.gender,
    data?.facebookAccount,
    account?.firstName,
    account?.middleName,
    account?.lastName,
    account?.suffix,
  ]);
  useEffect(() => {
    if (data?.ready) void navigate({ to: "/dashboard" });
  }, [data?.ready, navigate]);
  const refresh = () => queryClient.invalidateQueries();
  const save = useMutation({
    mutationFn: () =>
      client.auth.completeProfile(
        completionProfileSchema.parse({
          ...profile,
          ...(data?.academicNeeded
            ? {
                ...academic,
                graduationYear: Number(academic.graduationYear),
              }
            : {}),
        }),
      ),
    onSuccess: async () => {
      setEditing(false);
      setSent((value) => ({ ...value, phone: false }));
      setCodes((value) => ({ ...value, phone: "" }));
      await refresh();
    },
  });
  const createPassword = useMutation({
    mutationFn: () => client.auth.createGooglePassword({ password, confirmation }),
    onSuccess: async () => {
      setPassword("");
      setConfirmation("");
      await refresh();
    },
  });
  const send = useMutation({
    mutationFn: (kind: "email" | "phone") => client.auth.sendVerification({ kind }),
    onSuccess: (result, kind) => {
      setSent((value) => ({ ...value, [kind]: true }));
      setUntil((value) => ({ ...value, [kind]: Date.now() + result.resendAfterSeconds * 1000 }));
    },
  });
  useEffect(() => {
    if (data?.emailNeeded && data.canSendEmail && !emailStarted.current) {
      emailStarted.current = true;
      send.mutate("email");
    }
  }, [data?.emailNeeded, data?.canSendEmail, send.mutate]);
  const verify = useMutation({
    mutationFn: (kind: "email" | "phone") =>
      client.auth.confirmVerification({ kind, code: codes[kind] }),
    onSuccess: async (_result, kind) => {
      setCodes((value) => ({ ...value, [kind]: "" }));
      await refresh();
    },
  });
  const logout = useMutation({
    mutationFn: () => client.auth.logout(),
    onSuccess: async () => {
      await refresh();
      await navigate({ to: "/login" });
    },
  });
  const errors = [save.error, createPassword.error, send.error, verify.error, logout.error].filter(
    (error) => error !== null,
  );
  return (
    <AuthLayout wide>
      <AuthHeader
        title="Complete and verify your account"
        description={
          <span className="break-words">
            Finish these required steps before using the system. {data?.email}
          </span>
        }
      />
      <div className="flex flex-col gap-6">
        <LocalVerificationNotice />
        {status.isPending ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading account verification...
          </p>
        ) : null}
        {status.isError ? (
          <ErrorAlert onRetry={() => void status.refetch()}>
            Unable to load verification.
          </ErrorAlert>
        ) : null}
        {data && (data.profileNeeded || data.academicNeeded || editing) ? (
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <NameFields
              value={profile}
              prefix="completion"
              onChange={(names) => setProfile({ ...profile, ...names })}
            />
            <AccountProfileFields
              value={profile}
              onChange={(contact) => setProfile({ ...profile, ...contact })}
            />
            {data.academicNeeded ? (
              <AcademicProfileFields value={academic} onChange={setAcademic} />
            ) : null}
            <PrimaryButton
              className="sm:col-span-2 sm:justify-self-start"
              type="submit"
              pending={save.isPending}
            >
              Save contact details
            </PrimaryButton>
          </form>
        ) : data ? (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="break-words">Phone: {data.phoneNumber}</span>
            <Button variant="outline" onClick={() => setEditing(true)}>
              Change phone/details
            </Button>
          </div>
        ) : null}
        {data?.passwordNeeded ? (
          <section
            className="flex flex-col gap-4 border-t pt-6"
            aria-labelledby="create-password-title"
          >
            <h2 id="create-password-title" className="text-base font-semibold">
              Create your password (required)
            </h2>
            {data.googleFresh ? (
              <form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  createPassword.mutate();
                }}
              >
                <FormField id="setup-password" label="New password" required>
                  <Input
                    id="setup-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={256}
                    aria-describedby="setup-password-guidance"
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </FormField>
                <FormField id="setup-confirmation" label="Confirm password" required>
                  <Input
                    id="setup-confirmation"
                    type="password"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={256}
                    required
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </FormField>
                <PasswordGuidance id="setup-password-guidance" value={password} />
                <PrimaryButton
                  type="submit"
                  pending={createPassword.isPending}
                  disabled={password !== confirmation}
                >
                  Create password
                </PrimaryButton>
              </form>
            ) : (
              <p className="text-sm">
                Verify with Google again to create your password. Verification is valid for five
                minutes.
              </p>
            )}
            <Button variant="outline" nativeButton={false} render={<a href="/api/auth/google" />}>
              Verify with Google again
            </Button>
          </section>
        ) : null}
        {data
          ? (["email", "phone"] as const).map((kind) => {
              const needed = kind === "email" ? data.emailNeeded : data.phoneNeeded;
              if (!needed) return null;
              const available = kind === "email" ? data.canSendEmail : data.canSendPhone;
              const waiting = Math.max(0, Math.ceil((until[kind] - now) / 1000));
              return (
                <section
                  key={kind}
                  className="flex flex-col gap-4 border-t pt-6"
                  aria-labelledby={`verify-${kind}-title`}
                >
                  <h2 id={`verify-${kind}-title`} className="text-base font-semibold">
                    Verify your {kind === "email" ? "email" : "phone number"}
                  </h2>
                  <p className="break-words text-sm text-muted-foreground">
                    {kind === "email" ? data.email : data.phoneNumber}. Codes expire in 10 minutes.
                  </p>
                  {!available ? (
                    <p role="status" className="rounded-lg border bg-muted/50 px-3 py-3 text-sm">
                      {kind === "email" ? "Email" : "SMS"} delivery is unavailable. Contact an
                      administrator; verification cannot be skipped.
                    </p>
                  ) : null}
                  <Button
                    variant="outline"
                    disabled={
                      !available ||
                      send.isPending ||
                      waiting > 0 ||
                      (kind === "phone" && data.profileNeeded)
                    }
                    onClick={() => send.mutate(kind)}
                  >
                    {waiting
                      ? `Resend in ${waiting}s`
                      : sent[kind]
                        ? "Resend code"
                        : `Send ${kind === "email" ? "email" : "SMS"} code`}
                  </Button>
                  <form
                    className="flex flex-col gap-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      verify.mutate(kind);
                    }}
                  >
                    <FormField
                      id={`${kind}-code`}
                      label={`${kind === "email" ? "Email" : "SMS"} verification code`}
                      required
                    >
                      <Input
                        id={`${kind}-code`}
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        pattern="[0-9]{6}"
                        minLength={6}
                        maxLength={6}
                        required
                        value={codes[kind]}
                        onChange={(event) => setCodes({ ...codes, [kind]: event.target.value })}
                      />
                    </FormField>
                    <PrimaryButton type="submit" pending={verify.isPending} disabled={!available}>
                      Confirm {kind === "email" ? "email" : "phone"}
                    </PrimaryButton>
                  </form>
                </section>
              );
            })
          : null}
        {errors.map((error, index) => (
          <ErrorAlert key={index}>{error.message}</ErrorAlert>
        ))}
        <Button variant="outline" disabled={logout.isPending} onClick={() => logout.mutate()}>
          Sign out
        </Button>
      </div>
    </AuthLayout>
  );
}
