import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { FormCard, FormField, PrimaryButton } from "@/components/page-header";
import { PasswordGuidance } from "@/components/password-guidance";
import { client, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/reset-password")({ component: ResetPassword });
function ResetPassword() {
  const [token, setToken] = useState(
    () => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    const readToken = () => {
      const incoming = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (incoming) {
        setToken(incoming);
        setMessage("");
        setError("");
        window.history.replaceState(window.history.state, "", window.location.pathname);
      }
    };
    readToken();
    window.addEventListener("hashchange", readToken);
    return () => window.removeEventListener("hashchange", readToken);
  }, []);
  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 p-4">
      <div className="w-full max-w-md">
        <FormCard
          title={token ? "Choose a new password" : "Reset your password"}
          description="Reset links expire in 15 minutes and work once. Resetting a password signs out all sessions and keeps your authenticator enabled."
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              setPending(true);
              setError("");
              void (async () => {
                try {
                  if (token) {
                    if (password !== confirmation) throw new Error("Passwords must match.");
                    await client.auth.resetPassword({ token, password });
                    queryClient.clear();
                    setPassword("");
                    setConfirmation("");
                    setMessage("Password reset. Sign in with your new password and authenticator.");
                  } else {
                    const result = await client.auth.forgotPassword({ email });
                    setMessage(result.message);
                  }
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Unable to continue.");
                } finally {
                  setPending(false);
                }
              })();
            }}
          >
            {message ? (
              <p role="status">{message}</p>
            ) : token ? (
              <>
                <FormField id="reset-password" label="New password" required>
                  <Input
                    id="reset-password"
                    type="password"
                    autoComplete="new-password"
                    minLength={15}
                    maxLength={256}
                    required
                    value={password}
                    aria-describedby="reset-guidance"
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </FormField>
                <PasswordGuidance id="reset-guidance" value={password} />
                <FormField id="reset-confirmation" label="Confirm password" required>
                  <Input
                    id="reset-confirmation"
                    type="password"
                    autoComplete="new-password"
                    required
                    maxLength={256}
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                  />
                </FormField>
                <PrimaryButton type="submit" pending={pending} disabled={password !== confirmation}>
                  Save new password
                </PrimaryButton>
              </>
            ) : (
              <>
                <FormField id="reset-email" label="Email" required>
                  <Input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </FormField>
                <PrimaryButton type="submit" pending={pending}>
                  Send reset link
                </PrimaryButton>
              </>
            )}
            {error ? <p role="alert">{error}</p> : null}
            <Link className="underline" to="/login">
              Back to sign in
            </Link>
          </form>
        </FormCard>
      </div>
    </div>
  );
}
