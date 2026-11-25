import {
  signupEmailSchema,
  signupSchema,
  GOOGLE_SIGNIN_EMAIL_MESSAGE,
} from "@Alumni-Tracking-Ss/contracts/auth";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { AccountProfileFields } from "@/components/forms/account-profile-fields";
import { NameFields, emptyName } from "@/components/forms/name-fields";
import { AcademicProfileFields, emptyAcademic } from "@/components/forms/academic-profile-fields";
import { PasswordChecklist } from "@/components/forms/password-checklist";
import { PasswordInput } from "@/components/forms/password-input";
import { CheckboxRow } from "@/components/forms/checkbox-row";
import { Recaptcha } from "@/components/forms/recaptcha";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { FormField, PrimaryButton } from "@/components/forms/form-layout";
import { AuthHeader, AuthLayout } from "@/components/layout/auth-layout";
import {
  isPasswordScreeningMessage,
  passwordMeetsPolicy,
} from "@Alumni-Tracking-Ss/contracts/password-policy";
import { client, api, queryClient } from "@/lib/api";
import { safeReturnPath } from "@/lib/session-ended";

export const Route = createFileRoute("/login")({
  validateSearch: (
    search: Record<string, unknown>,
  ): { error?: "google" | "google_domain"; redirect?: string } => {
    const redirect = safeReturnPath(search.redirect);
    return {
      ...(search.error === "google" || search.error === "google_domain"
        ? { error: search.error }
        : {}),
      ...(redirect ? { redirect } : {}),
    };
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const config = useQuery(api.auth.config.queryOptions());
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [signupStep, setSignupStep] = useState<1 | 2>(1);
  const stepHeading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (mode === "signup") stepHeading.current?.focus();
  }, [mode, signupStep]);
  const [profile, setProfile] = useState({ phoneNumber: "", gender: "", facebookAccount: "" });
  const [names, setNames] = useState(emptyName);
  const [academic, setAcademic] = useState(emptyAcademic);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [confirmationTouched, setConfirmationTouched] = useState(false);
  const confirmationInput = useRef<HTMLInputElement>(null);
  const [fallbackChecked, setFallbackChecked] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState<string | undefined>();
  const [captchaAttempt, setCaptchaAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(
    search.error === "google_domain"
      ? GOOGLE_SIGNIN_EMAIL_MESSAGE
      : search.error === "google"
        ? "Google sign-in could not be completed. Please try again or sign in with your password."
        : null,
  );

  const [emailTouched, setEmailTouched] = useState(false);
  const emailResult = signupEmailSchema.safeParse(email);
  const emailError =
    mode === "signup" && emailTouched && !emailResult.success
      ? emailResult.error.issues[0]?.message
      : undefined;

  const [screeningError, setScreeningError] = useState<string | null>(null);

  const recaptcha = config.data?.recaptcha;
  const needsCheckbox = recaptcha?.enabled && !recaptcha.live;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mode === "signup" && signupStep === 1) {
      setEmailTouched(true);
      if (!emailResult.success) {
        document.getElementById("email")?.focus();
        return;
      }
      setSignupStep(2);
      setFormError(null);
      return;
    }
    if (mode === "signup" && confirmation !== password) {
      setConfirmationTouched(true);
      confirmationInput.current?.focus();
      return;
    }
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
      // After a session ended, return to the page the user was on.
      const returnTo = mode === "login" ? safeReturnPath(search.redirect) : undefined;
      await (returnTo ? navigate({ href: returnTo }) : navigate({ to: "/dashboard" }));
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
  const finalStep = !signup || signupStep === 2;
  const confirmationError = confirmationTouched && confirmation !== password;
  const googleLabel = signup ? "Sign Up with Google" : "Sign In with Google";
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
    <FormField id="email" label="Email" required error={emailError}>
      <Input
        id="email"
        type="email"
        autoComplete="email"
        aria-invalid={Boolean(emailError) || undefined}
        aria-describedby={
          signup ? (emailError ? "email-error email-hint" : "email-hint") : undefined
        }
        onBlur={() => setEmailTouched(true)}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        required
      />
      {signup ? (
        <p id="email-hint" className="text-xs text-muted-foreground">
          Use your BukSU institutional email. Personal email addresses are not accepted.
        </p>
      ) : null}
    </FormField>
  );
  const passwordField = (
    <FormField id="password" label="Password" required>
      <PasswordInput
        key={signup ? "signup-password" : "login-password"}
        id="password"
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
        title={signup ? "Create Your Alumni Account" : "Sign In"}
        description={
          signup
            ? "Use your BukSU email. Complete two short steps."
            : "Sign in to manage academic structure, alumni profiles, and graduate tracking."
        }
        className={signup ? "mb-4" : undefined}
      />
      <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
        {signup ? (
          <>
            <ol
              aria-label="Account creation progress"
              className="grid grid-cols-2 gap-3 border-b border-border pb-4 text-sm"
            >
              {["Personal Details", "Studies & Password"].map((label, index) => (
                <li
                  key={label}
                  aria-current={signupStep === index + 1 ? "step" : undefined}
                  className={
                    signupStep === index + 1
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  }
                >
                  <span className="mr-2 tabular-nums">{index + 1}.</span>
                  {label}
                </li>
              ))}
            </ol>
            <h2 ref={stepHeading} tabIndex={-1} className="sr-only">
              {signupStep === 1 ? "Step 1: Personal Details" : "Step 2: Studies and Password"}
            </h2>
            {signupStep === 1 ? (
              <>
                {google ? (
                  <>
                    {google}
                    {divider}
                  </>
                ) : null}
                <fieldset className="grid content-start gap-3 sm:grid-cols-2">
                  <legend className="sr-only">Your Name</legend>
                  <NameFields
                    value={names}
                    onChange={setNames}
                    prefix="signup"
                    compact
                    optionalBehindLink
                  />
                </fieldset>
                <fieldset className="grid content-start gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                  <legend className="sr-only">Contact Details</legend>
                  <div className="sm:col-span-2">{emailField}</div>
                  <AccountProfileFields
                    value={profile}
                    onChange={setProfile}
                    compact
                    phoneFullWidth={false}
                  />
                </fieldset>
              </>
            ) : (
              <>
                <AcademicProfileFields value={academic} onChange={setAcademic} compact />
                <fieldset className="grid content-start gap-3">
                  <legend className="mb-3 text-sm font-semibold">Secure Your Account</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {passwordField}
                    <FormField id="password-confirmation" label="Confirm Password" required>
                      <PasswordInput
                        id="password-confirmation"
                        ref={confirmationInput}
                        visibilityLabel="Confirm Password"
                        autoComplete="new-password"
                        value={confirmation}
                        onChange={(event) => setConfirmation(event.target.value)}
                        onBlur={() => setConfirmationTouched(true)}
                        required
                        maxLength={256}
                        aria-invalid={confirmationError || undefined}
                        aria-describedby="password-confirmation-message"
                      />
                      <p
                        id="password-confirmation-message"
                        aria-live="polite"
                        className={
                          confirmationError
                            ? "text-xs text-destructive"
                            : "text-xs text-muted-foreground"
                        }
                      >
                        {confirmationError ? "Passwords do not match." : "Re-enter your password."}
                      </p>
                    </FormField>
                  </div>
                  <PasswordChecklist
                    id="signup-password-guidance"
                    value={password}
                    serverError={screeningError}
                  />
                </fieldset>
              </>
            )}
          </>
        ) : (
          <>
            {emailField}
            {passwordField}
          </>
        )}
        {signup && finalStep && recaptcha?.enabled && recaptcha.live && recaptcha.siteKey ? (
          <Recaptcha
            key={captchaAttempt}
            siteKey={recaptcha.siteKey}
            action="SIGNUP"
            onToken={setRecaptchaToken}
          />
        ) : null}
        {!signup ? (
          <div className="-mt-1 flex flex-wrap items-center justify-between gap-2">
            {recaptcha?.enabled && recaptcha.live && recaptcha.siteKey ? (
              <Recaptcha
                key={captchaAttempt}
                siteKey={recaptcha.siteKey}
                action="LOGIN"
                onToken={setRecaptchaToken}
              />
            ) : needsCheckbox ? (
              <CheckboxRow checked={fallbackChecked} onCheckedChange={setFallbackChecked}>
                I am not a robot
              </CheckboxRow>
            ) : (
              <span />
            )}
            <Link
              className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              to="/reset-password"
            >
              Forgot Password?
            </Link>
          </div>
        ) : finalStep && needsCheckbox ? (
          <div className="-mt-1">
            <CheckboxRow checked={fallbackChecked} onCheckedChange={setFallbackChecked}>
              I am not a robot
            </CheckboxRow>
          </div>
        ) : null}
        <div className={signup && signupStep === 2 ? "grid grid-cols-[auto_1fr] gap-3" : "grid"}>
          {signup && signupStep === 2 ? (
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setFormError(null);
                setSignupStep(1);
              }}
            >
              Back
            </Button>
          ) : null}
          <PrimaryButton
            type="submit"
            pending={pending}
            disabled={
              config.isPending ||
              config.isError ||
              (finalStep && Boolean(recaptcha?.enabled && recaptcha.live && !recaptchaToken)) ||
              (signup &&
                signupStep === 2 &&
                (!passwordMeetsPolicy(password) || confirmation !== password))
            }
            pendingLabel={signup ? "Creating" : "Signing In"}
          >
            {signup ? (signupStep === 1 ? "Continue" : "Create Account") : "Sign In"}
          </PrimaryButton>
        </div>
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
              setSignupStep(1);
              setConfirmation("");
              setConfirmationTouched(false);
              setMode(signup ? "login" : "signup");
            }}
          >
            {signup ? "Already registered? Sign In" : "Need an account? Sign Up"}
          </button>
        ) : null}
      </form>
    </AuthLayout>
  );
}
