import { Check, Circle, ShieldCheck } from "lucide-react";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_REQUIREMENTS,
  PASSWORD_SCREENING_NOTE,
  passwordLength,
} from "@Alumni-Tracking-Ss/contracts/password-policy";

/**
 * Live checklist for new passwords. Items come from the shared policy so the browser and
 * server cannot drift; the common/breached screening stays server-side (static note here).
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
  return (
    <div id={id} className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground" aria-live="off">
        {passwordLength(value)} / {PASSWORD_MAX_LENGTH} characters
      </p>
      <ul
        aria-live="polite"
        aria-label="Password requirements"
        className="grid gap-1 text-sm sm:grid-cols-2"
      >
        {PASSWORD_REQUIREMENTS.map((requirement) => {
          const met = requirement.test(value);
          return (
            <li key={requirement.id} className="flex items-start gap-2">
              {met ? (
                <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-success" />
              ) : (
                <Circle
                  aria-hidden="true"
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                />
              )}
              <span className={met ? "text-foreground" : "text-muted-foreground"}>
                <span className="sr-only">{met ? "Met: " : "Not met: "}</span>
                {requirement.label}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <ShieldCheck aria-hidden="true" className="size-4 shrink-0" />
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
