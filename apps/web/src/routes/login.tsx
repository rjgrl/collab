import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { AccountProfileFields } from "@/components/forms/account-profile-fields";
import { NameFields, emptyName } from "@/components/forms/name-fields";
import { AcademicProfileFields, emptyAcademic } from "@/components/forms/academic-profile-fields";
import { LocalVerificationNotice } from "@/components/layout/local-verification-notice";
import { PasswordGuidance } from "@/components/forms/password-guidance";
import { CheckboxRow } from "@/components/forms/checkbox-row";
import { Recaptcha } from "@/components/forms/recaptcha";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { AuthHeader, AuthLayout } from "@/components/layout/auth-layout";
import { signupSchema } from "@Alumni-Tracking-Ss/contracts/auth";
import { client, api, queryClient } from "@/lib/api";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { error?: "google" | "google_domain" } =>
    search.error === "google" || search.error === "google_domain" ? { error: search.error } : {},
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const config = useQuery(api.auth.config.queryOptions());
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [profile, setProfile] = useState({ phoneNumber: "", gender: "", facebookAccount: "" });
  const [names, setNames] = useState(emptyName);
  const [academic, setAcademic] = useState(emptyAcademic);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fallbackChecked, setFallbackChecked] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | undefined>();
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    search.error === "google_domain"
      ? "Admin and faculty accounts must sign in with a BukSU institutional Google account."
      : search.error === "google"
        ? "Google sign-in could not be completed. Please try again or sign in with your password."
        : null,
  );

  const recaptcha = config.data?.recaptcha;
  const needsCheckbox = recaptcha?.enabled && !recaptcha.live;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    try {
      const credentials = {
        email,
        password,
        recaptchaToken,
        recaptchaFallback: needsCheckbox ? fallbackChecked : true,
      };
      if (mode === "signup")
        await client.auth.signup(
          signupSchema.parse({
            ...credentials,
            ...profile,
            ...names,
            ...academic,
            graduationYear: Number(academic.graduationYear),
          }),
        );
      else await client.auth.login(credentials);
      queryClient.clear();
      toast.success(mode === "login" ? "Signed in" : "Account created");
      await navigate({ to: "/dashboard" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to continue";
      setFormError(message);
    } finally {
      setRecaptchaToken(undefined);
      setCaptchaAttempt((attempt) => attempt + 1);
      setPending(false);
    }
  }

  return (
    <AuthLayout wide={mode === "signup"}>
      <AuthHeader
        title={mode === "login" ? "Sign in" : "Create an account"}
        description="Sign in to manage academic structure, alumni profiles, and graduate tracking."
      />
      <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        <LocalVerificationNotice />
        {mode === "signup" ? (
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-sm font-semibold">Personal details</legend>
            <NameFields value={names} onChange={setNames} prefix="signup" />
          </fieldset>
        ) : null}
        <FormField id="email" label="Email" required>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-describedby="email-hint"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
          <p id="email-hint" className="text-xs text-muted-foreground">
            Use your BukSU institutional email. Personal email addresses are not accepted.
          </p>
        </FormField>
        {mode === "signup" ? (
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-3 text-sm font-semibold">Contact details</legend>
            <AccountProfileFields value={profile} onChange={setProfile} />
          </fieldset>
        ) : null}
        {mode === "signup" ? (
          <AcademicProfileFields value={academic} onChange={setAcademic} />
        ) : null}
        <FormField id="password" label="Password" required>
          <Input
            id="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            minLength={mode === "signup" ? 15 : 1}
            maxLength={256}
            aria-describedby={mode === "signup" ? "signup-password-guidance" : undefined}
          />
        </FormField>
        {mode === "signup" ? (
          <PasswordGuidance id="signup-password-guidance" value={password} />
        ) : null}
        {mode === "login" ? (
          <Link
            className="-mt-1 self-end text-sm font-medium text-primary underline-offset-4 hover:underline"
            to="/reset-password"
          >
            Forgot password?
          </Link>
        ) : null}
        {recaptcha?.enabled && recaptcha.live && recaptcha.siteKey ? (
          <Recaptcha key={captchaAttempt} siteKey={recaptcha.siteKey} onToken={setRecaptchaToken} />
        ) : null}
        {needsCheckbox ? (
          <CheckboxRow checked={fallbackChecked} onCheckedChange={setFallbackChecked}>
            I am not a robot
          </CheckboxRow>
        ) : null}
        <PrimaryButton
          type="submit"
          pending={pending}
          disabled={
            config.isPending ||
            config.isError ||
            Boolean(recaptcha?.enabled && recaptcha.live && !recaptchaToken)
          }
          pendingLabel={mode === "login" ? "Signing in" : "Creating"}
        >
          {mode === "login" ? "Sign in" : "Create account"}
        </PrimaryButton>
        {formError ? <ErrorAlert>{formError}</ErrorAlert> : null}
        <div
          aria-hidden="true"
          className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
        >
          or
        </div>
        {config.data?.google.enabled ? (
          <Button variant="outline" nativeButton={false} render={<a href="/api/auth/google" />}>
            {mode === "login" ? "Sign in with Google" : "Sign up with Google"}
          </Button>
        ) : (
          <div className="flex flex-col gap-2">
            <Button type="button" variant="outline" disabled>
              {mode === "login" ? "Sign in with Google" : "Sign up with Google"}
            </Button>
            {!config.isPending ? (
              <p className="text-center text-xs text-muted-foreground">
                Google sign-in is currently unavailable.
              </p>
            ) : null}
          </div>
        )}
        {config.data?.signupEnabled ? (
          <button
            type="button"
            className="min-h-10 rounded-lg text-sm font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setFormError(null);
              setMode(mode === "login" ? "signup" : "login");
            }}
          >
            {mode === "login" ? "Need an account? Sign up" : "Already registered? Sign in"}
          </button>
        ) : null}
      </form>
    </AuthLayout>
  );
}
