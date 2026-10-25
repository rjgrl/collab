import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { AccountProfileFields } from "@/components/account-profile-fields";
import { NameFields, emptyName } from "@/components/name-fields";
import { AcademicProfileFields, emptyAcademic } from "@/components/academic-profile-fields";
import { LocalVerificationNotice } from "@/components/local-verification-notice";
import { PasswordGuidance } from "@/components/password-guidance";
import { CheckboxRow } from "@/components/checkbox-row";
import { Recaptcha } from "@/components/recaptcha";
import { FormField, PrimaryButton } from "@/components/page-header";
import { signupSchema } from "@Alumni-Tracking-Ss/contracts/auth";
import { client, api, queryClient } from "@/utils/api";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): { error?: "google" } =>
    search.error === "google" ? { error: "google" } : {},
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
    search.error === "google"
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
            graduationYear: academic.graduationYear ? Number(academic.graduationYear) : undefined,
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
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className={mode === "signup" ? "w-full max-w-2xl" : "w-full max-w-md"}>
        <CardHeader>
          <h1 className="text-2xl font-semibold tracking-tight">Alumni Tracking System</h1>
          <CardDescription>
            Sign in to manage academic structure, alumni profiles, and graduate tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
            <LocalVerificationNotice />
            {mode === "signup" ? (
              <NameFields value={names} onChange={setNames} prefix="signup" />
            ) : null}
            <FormField id="email" label="Email" required>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </FormField>
            {mode === "signup" ? (
              <AccountProfileFields value={profile} onChange={setProfile} />
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
              <Link className="text-sm underline" to="/reset-password">
                Forgot password?
              </Link>
            ) : null}
            {recaptcha?.enabled && recaptcha.live && recaptcha.siteKey ? (
              <Recaptcha
                key={captchaAttempt}
                siteKey={recaptcha.siteKey}
                onToken={setRecaptchaToken}
              />
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
            {formError ? (
              <p className="text-sm text-destructive" role="alert">
                {formError}
              </p>
            ) : null}
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
                className="text-sm text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setFormError(null);
                  setMode(mode === "login" ? "signup" : "login");
                }}
              >
                {mode === "login" ? "Need an account? Sign up" : "Already registered? Sign in"}
              </button>
            ) : null}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
