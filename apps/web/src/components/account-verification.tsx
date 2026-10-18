import { accountProfileSchema } from "@Alumni-Tracking-Ss/api/validation";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { AccountProfileFields } from "@/components/account-profile-fields";
import { FormField, PrimaryButton } from "@/components/page-header";
import { postJson } from "@/lib/session";
import { client, orpc, queryClient } from "@/utils/orpc";

export function AccountVerification() {
  const navigate = useNavigate();
  const status = useQuery(orpc.auth.verificationStatus.queryOptions());
  const data = status.data;
  const [profile, setProfile] = useState({ phoneNumber: "", gender: "", facebookAccount: "" });
  const [editing, setEditing] = useState(false);
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
      setProfile({
        phoneNumber: data.phoneNumber,
        gender: data.gender,
        facebookAccount: data.facebookAccount,
      });
  }, [data?.phoneNumber, data?.gender, data?.facebookAccount]);
  useEffect(() => {
    if (data?.ready) void navigate({ to: "/dashboard" });
  }, [data?.ready, navigate]);
  const refresh = () => queryClient.invalidateQueries();
  const save = useMutation({
    mutationFn: () => client.auth.completeProfile(accountProfileSchema.parse(profile)),
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
    mutationFn: () => postJson("/api/auth/logout", {}),
    onSuccess: async () => {
      await refresh();
      await navigate({ to: "/login" });
    },
  });
  const errors = [save.error, createPassword.error, send.error, verify.error, logout.error].filter(
    (error) => error !== null,
  );
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader>
          <CardTitle>Complete and verify your account</CardTitle>
          <CardDescription>
            Finish these required steps before using the system. {data?.email}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {status.isPending ? <p role="status">Loading account verification...</p> : null}
          {status.isError ? (
            <p role="alert">
              Unable to load verification.{" "}
              <button onClick={() => void status.refetch()}>Retry</button>
            </p>
          ) : null}
          {data && (data.profileNeeded || editing) ? (
            <form
              className="grid gap-3 sm:grid-cols-2"
              onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
              }}
            >
              <AccountProfileFields value={profile} onChange={setProfile} />
              <PrimaryButton type="submit" pending={save.isPending}>
                Save contact details
              </PrimaryButton>
            </form>
          ) : data ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>Phone: {data.phoneNumber}</span>
              <Button variant="outline" onClick={() => setEditing(true)}>
                Change phone/details
              </Button>
            </div>
          ) : null}
          {data?.passwordNeeded ? (
            <section
              className="flex flex-col gap-3 border-t pt-4"
              aria-labelledby="create-password-title"
            >
              <h2 id="create-password-title" className="font-medium">
                Create your password (required)
              </h2>
              {data.googleFresh ? (
                <form
                  className="flex flex-col gap-3"
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
                      minLength={8}
                      maxLength={128}
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
                      minLength={8}
                      maxLength={128}
                      required
                      value={confirmation}
                      onChange={(event) => setConfirmation(event.target.value)}
                    />
                  </FormField>
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
                    className="flex flex-col gap-3 border-t pt-4"
                    aria-labelledby={`verify-${kind}-title`}
                  >
                    <h2 id={`verify-${kind}-title`} className="font-medium">
                      Verify your {kind === "email" ? "email" : "phone number"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {kind === "email" ? data.email : data.phoneNumber}. Codes expire in 10
                      minutes.
                    </p>
                    {!available ? (
                      <p role="status" className="text-sm">
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
                      className="flex flex-col gap-3"
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
            <p key={index} role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          ))}
          <Button variant="outline" disabled={logout.isPending} onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
