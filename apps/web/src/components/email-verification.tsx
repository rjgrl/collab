import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { FormField, PrimaryButton } from "@/components/page-header";
import { client, api, queryClient } from "@/utils/api";
export function EmailVerification() {
  const status = useQuery(api.auth.verificationStatus.queryOptions());
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!open) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [open]);
  const send = useMutation({
    mutationFn: () => client.auth.sendVerification({ kind: "email" }),
    onSuccess: () => {
      setSent(true);
      setNow(Date.now());
      setResendAt(Date.now() + 60_000);
    },
  });
  const confirm = useMutation({
    mutationFn: () => client.auth.confirmVerification({ kind: "email", code }),
    onSuccess: async () => {
      setCode("");
      setOpen(false);
      await queryClient.invalidateQueries();
    },
  });
  const error = send.error?.message || confirm.error?.message || status.error?.message;
  return (
    <div className="mt-3 text-sm">
      {status.data?.emailVerified ? (
        <p>Recovery email confirmed</p>
      ) : (
        <Button
          variant="outline"
          disabled={!status.data}
          onClick={() => {
            send.reset();
            confirm.reset();
            setCode("");
            setOpen(true);
          }}
        >
          Verify recovery email
        </Button>
      )}
      {open ? (
        <FormDialog
          open
          onOpenChange={setOpen}
          pending={send.isPending || confirm.isPending}
          title="Verify recovery email"
          description={`Confirm ${status.data?.email ?? "your account email"} to enable password recovery. Your existing account access is preserved.`}
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              confirm.mutate();
            }}
          >
            {!status.data?.canSendEmail ? (
              <p role="status">Email delivery is not configured. Contact an administrator.</p>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={send.isPending || now < resendAt}
                onClick={() => send.mutate()}
              >
                {now < resendAt
                  ? `Resend in ${Math.ceil((resendAt - now) / 1000)} seconds`
                  : sent
                    ? "Resend email code"
                    : "Send email code"}
              </Button>
            )}
            <FormField id="recovery-email-code" label="Email verification code" required>
              <Input
                id="recovery-email-code"
                required
                autoComplete="one-time-code"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value)}
              />
            </FormField>
            {error ? <p role="alert">{error}</p> : null}
            <PrimaryButton
              type="submit"
              pending={confirm.isPending}
              disabled={!sent || code.length !== 6}
            >
              Confirm recovery email
            </PrimaryButton>
          </form>
        </FormDialog>
      ) : null}
    </div>
  );
}
