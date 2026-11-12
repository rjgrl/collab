import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { AccountProfileFields } from "@/components/forms/account-profile-fields";
import { NameFields, emptyName } from "@/components/forms/name-fields";
import { AcademicProfileFields, emptyAcademic } from "@/components/forms/academic-profile-fields";
import { PasswordChecklist } from "@/components/forms/password-checklist";
import { CheckboxRow } from "@/components/forms/checkbox-row";
import { Recaptcha } from "@/components/forms/recaptcha";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { FormField, NumberedLegend, PrimaryButton } from "@/components/forms/form-layout";
import { AuthHeader, AuthLayout } from "@/components/layout/auth-layout";
import { signupSchema } from "@Alumni-Tracking-Ss/contracts/auth";
import {
  isPasswordScreeningMessage,
  passwordMeetsPolicy,
} from "@Alumni-Tracking-Ss/contracts/password-policy";
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

  const [screeningError, setScreeningError] = useState<string | null>(null);

  const recaptcha = config.data?.recaptcha;
  const needsCheckbox = recaptcha?.enabled && !recaptcha.live;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFormError(null);
    setScreeningError(null);
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
      if (mode === "signup" && isPasswordScreeningMessage(message)) setScreeningError(message);
      else setFormError(message);
    } finally {
      setRecaptchaToken(undefined);
      setCaptchaAttempt((attempt) => attempt + 1);
      setPending(false);
    }
  }

  const signup = mode === "signup";
  const googleLabel = signup ? "Sign up with Google" : "Sign in with Google";
  // Google sign-in only appears when it is configured and enabled; no disabled placeholder.
  const google = config.data?.google.enabled ? (
    <Button variant="outline" nativeButton={false} render={<a href="/api/auth/google" />}>
      {googleLabel}
    </Button>
  ) : null;
  const divider = (
    <div
      aria-hidden="true"
      className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border"
    >
      or
    </div>
  );
  const emailField = (
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
      <p id="email-hint" className={signup ? "sr-only" : "text-xs text-muted-foreground"}>
        Use your BukSU institutional email. Personal email addresses are not accepted.
      </p>
    </FormField>
  );
  const passwordField = (
    <FormField id="password" label="Password" required>
      <Input
        id="password"
        type="password"
        autoComplete={signup ? "new-password" : "current-password"}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
          setScreeningError(null);
        }}
        required
        minLength={signup ? 15 : 1}
        maxLength={256}
        aria-describedby={signup ? "signup-password-guidance" : undefined}
      />
    </FormField>
  );

  return (
    <AuthLayout wide={signup}>
      <AuthHeader
        title={signup ? "Create your alumni account" : "Sign in"}
        description={
          signup
            ? "Use the BukSU email you will sign in with. It takes about two minutes."
            : "Sign in to manage academic structure, alumni profiles, and graduate tracking."
        }
        className={signup ? "mb-4" : undefined}
      />
      <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        {signup ? (
          <>
            {google ? (
              <>
                {google}
                {divider}
              </>
            ) : null}
            <div className="grid gap-x-8 gap-y-6 lg:grid-cols-2">
              <fieldset className="grid content-start gap-3 sm:grid-cols-2">
                <NumberedLegend step={1}>About you</NumberedLegend>
                <NameFields
                  value={names}
                  onChange={setNames}
                  prefix="signup"
                  compact
                  optionalBehindLink
                />
              </fieldset>
              <fieldset className="grid content-start gap-3 sm:grid-cols-2">
                <NumberedLegend step={2}>Contact</NumberedLegend>
                <div className="sm:col-span-2">{emailField}</div>
                <AccountProfileFields value={profile} onChange={setProfile} compact />
              </fieldset>
              <AcademicProfileFields value={academic} onChange={setAcademic} compact />
              <fieldset className="grid content-start gap-3">
                <NumberedLegend step={4}>Password</NumberedLegend>
                {passwordField}
                <PasswordChecklist
                  id="signup-password-guidance"
                  value={password}
                  serverError={screeningError}
                />
              </fieldset>
            </div>
          </>
        ) : (
          <>
            {emailField}
            {passwordField}
            <Link
              className="-mt-1 self-end text-sm font-medium text-primary underline-offset-4 hover:underline"
              to="/reset-password"
            >
              Forgot password?
            </Link>
          </>
        )}
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
            Boolean(recaptcha?.enabled && recaptcha.live && !recaptchaToken) ||
            (signup && !passwordMeetsPolicy(password))
          }
          pendingLabel={signup ? "Creating" : "Signing in"}
        >
          {signup ? "Create account" : "Sign in"}
        </PrimaryButton>
        {formError ? <ErrorAlert>{formError}</ErrorAlert> : null}
        {signup || !google ? null : (
          <>
            {divider}
            {google}
          </>
        )}
        {config.data?.signupEnabled ? (
          <button
            type="button"
            className="min-h-10 rounded-lg text-sm font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => {
              setFormError(null);
              setScreeningError(null);
              setMode(signup ? "login" : "signup");
            }}
          >
            {signup ? "Already registered? Sign in" : "Need an account? Sign up"}
          </button>
        ) : null}
      </form>
    </AuthLayout>
  );
}
