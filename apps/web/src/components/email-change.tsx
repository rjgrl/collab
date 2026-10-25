import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { toast } from "sonner";
import { api, client, queryClient } from "@/utils/api";
import { FormField, PrimaryButton } from "./page-header";
import { StatusBadge } from "./status-badge";

export function EmailChange() {
  const status = useQuery(api.auth.verificationStatus.queryOptions());
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const request = useMutation({
    mutationFn: () => client.auth.requestEmailChange({ email, currentPassword: password }),
    onSuccess: async () => {
      setSent(true);
      setCode("");
      await queryClient.invalidateQueries({
        queryKey: api.auth.verificationStatus.queryOptions().queryKey,
      });
    },
  });
  const confirm = useMutation({
    mutationFn: () => client.auth.confirmEmailChange({ email, currentPassword: password, code }),
    onSuccess: async () => {
      setOpen(false);
      setPassword("");
      setCode("");
      await queryClient.invalidateQueries();
      toast.success("Email changed and confirmed. Other sessions have been signed out.");
    },
  });
  const pending = request.isPending || confirm.isPending;
  const error = request.error?.message || confirm.error?.message;
  return (
    <>
      <Button
        type="button"
        variant="link"
        size="xs"
        disabled={!status.data}
        onClick={() => {
          request.reset();
          confirm.reset();
          setPassword("");
          setCode("");
          setEmail(status.data?.pendingEmail ?? "");
          setSent(Boolean(status.data?.pendingEmail));
          setOpen(true);
        }}
      >
        {status.data?.pendingEmail ? "Confirm new email" : "Change email"}
      </Button>
      {open ? (
        <FormDialog
          open
          onOpenChange={(value) => {
            setOpen(value);
            if (!value) setPassword("");
          }}
          pending={pending}
          title="Change email address"
          description="Your current email remains active until the new address is confirmed. Confirming signs out your other sessions and keeps your authenticator enabled."
        >
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (sent) confirm.mutate();
              else request.mutate();
            }}
          >
            <FormField id="change-email-address" label="New email address" required>
              <Input
                id="change-email-address"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                value={email}
                readOnly={sent}
                onChange={(event) => setEmail(event.target.value)}
              />
            </FormField>
            <FormField id="change-email-password" label="Current password" required>
              <Input
                id="change-email-password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </FormField>
            {sent ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <StatusBadge tone="unverified" />
                  <span>Check the new address for a code. Codes expire in 10 minutes.</span>
                </div>
                <FormField id="change-email-code" label="New email confirmation code" required>
                  <Input
                    id="change-email-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    required
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </FormField>
              </>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <PrimaryButton
                type="submit"
                pending={pending}
                pendingLabel={sent ? "Confirming" : "Sending"}
              >
                {sent ? "Confirm new email" : "Send confirmation code"}
              </PrimaryButton>
              {sent ? (
                <Button
                  type="button"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    setSent(false);
                    setCode("");
                    request.reset();
                    confirm.reset();
                  }}
                >
                  Resend or change address
                </Button>
              ) : null}
            </div>
          </form>
        </FormDialog>
      ) : null}
    </>
  );
}
