import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { Checkbox } from "@Alumni-Tracking-Ss/ui/components/checkbox";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { toast } from "sonner";

import { FormField, PrimaryButton } from "@/components/page-header";
import { postJson } from "@/lib/session";
import { orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const config = useQuery(orpc.auth.config.queryOptions());
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("admin@alumni.local");
  const [password, setPassword] = useState("AlumniAdmin123!");
  const [fallbackChecked, setFallbackChecked] = useState(false);
  const [pending, setPending] = useState(false);

  const recaptcha = config.data?.recaptcha;
  const needsCheckbox = recaptcha?.enabled && !recaptcha.live;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    try {
      await postJson(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        name,
        email,
        password,
        recaptchaFallback: needsCheckbox ? fallbackChecked : true,
      });
      await queryClient.invalidateQueries();
      toast.success(mode === "login" ? "Signed in" : "Account created");
      await navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to continue");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Alumni Tracking System</CardTitle>
          <CardDescription>
            Sign in to manage academic structure, alumni profiles, and graduate tracking.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)}>
            {mode === "signup" ? (
              <FormField id="name" label="Name">
                <Input id="name" value={name} onChange={(event) => setName(event.target.value)} required />
              </FormField>
            ) : null}
            <FormField id="email" label="Email">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </FormField>
            <FormField id="password" label="Password">
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                minLength={8}
              />
            </FormField>
            {needsCheckbox ? (
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={fallbackChecked}
                  onCheckedChange={(value) => setFallbackChecked(value === true)}
                />
                I am not a robot
              </label>
            ) : null}
            <PrimaryButton type="submit" pending={pending}>
              {mode === "login" ? "Sign in" : "Create account"}
            </PrimaryButton>
            {config.data?.google.enabled ? (
              <Button variant="outline" nativeButton={false} render={<a href="/api/auth/google" />}>
                Continue with Google
              </Button>
            ) : null}
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-4 hover:underline"
              onClick={() => setMode(mode === "login" ? "signup" : "login")}
            >
              {mode === "login" ? "Need an account? Sign up" : "Already registered? Sign in"}
            </button>
            <p className="text-xs text-muted-foreground">
              Seeded Super Admin: admin@alumni.local / AlumniAdmin123!
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
