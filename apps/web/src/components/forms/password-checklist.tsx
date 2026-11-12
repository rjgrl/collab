import { Check, Circle, ShieldCheck } from "lucide-react";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_REQUIREMENTS,
  PASSWORD_SCREENING_NOTE,
  passwordLength,
} from "@Alumni-Tracking-Ss/contracts/password-policy";

/**
 * Live checklist for new passwords, shown as one row of chips that turn green as each rule is
 * met. Items come from the shared policy so the browser and server cannot drift; the
 * common/breached screening stays server-side (static note). The maximum-length rule is only
 * shown once it is broken, because it is met by every ordinary password.
 */
export function PasswordChecklist({
  id,
  value,
  serverError,
}: {
  id: string;
  value: string;
  serverError?: string | null;
}) {
  const tooLong = passwordLength(value) > PASSWORD_MAX_LENGTH;
  return (
    <div id={id} className="flex flex-col gap-2">
      <ul aria-live="polite" aria-label="Password requirements" className="flex flex-wrap gap-1.5">
        {PASSWORD_REQUIREMENTS.filter(
          (requirement) => requirement.id !== "max-length" || tooLong,
        ).map((requirement) => {
          const met = requirement.test(value);
          return (
            <li
              key={requirement.id}
              className={cn(
                "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
                met ? "bg-success-muted text-success" : "bg-muted text-muted-foreground",
              )}
            >
              {met ? (
                <Check aria-hidden="true" className="size-3.5 shrink-0" />
              ) : (
                <Circle aria-hidden="true" className="size-3 shrink-0" />
              )}
              <span className="sr-only">{met ? "Met: " : "Not met: "}</span>
              {requirement.label}
            </li>
          );
        })}
      </ul>
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="size-3.5 shrink-0 translate-y-px" />
        <span>{PASSWORD_SCREENING_NOTE}</span>
      </p>
      {serverError ? (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      ) : null}
    </div>
  );
}
