import { PASSWORD_GUIDANCE } from "@Alumni-Tracking-Ss/api/password-policy";
export function PasswordGuidance({ id, value }: { id: string; value: string }) {
  const length = Array.from(value.normalize("NFC")).length;
  return (
    <p id={id} className="text-xs text-muted-foreground" aria-live="polite">
      {PASSWORD_GUIDANCE} {value ? `${length} characters entered.` : ""}
    </p>
  );
}
