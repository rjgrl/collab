import { PASSWORD_GUIDANCE } from "@Alumni-Tracking-Ss/contracts/password-policy";
export function PasswordGuidance({ id, value }: { id: string; value: string }) {
  const length = Array.from(value.normalize("NFC")).length;
  return (
    <p id={id} className="text-sm leading-relaxed text-muted-foreground" aria-live="polite">
      {PASSWORD_GUIDANCE} {value ? `${length} characters entered.` : ""}
    </p>
  );
}
