import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Autocomplete } from "@Alumni-Tracking-Ss/ui/components/autocomplete";
import { FormField } from "@/components/page-header";

export type NameDraft = { firstName: string; middleName: string; lastName: string; suffix: string };
export const emptyName: NameDraft = { firstName: "", middleName: "", lastName: "", suffix: "" };
export function nameDraft(
  value?: Partial<{ [K in keyof NameDraft]: string | null }> | null,
): NameDraft {
  return {
    firstName: value?.firstName ?? "",
    middleName: value?.middleName ?? "",
    lastName: value?.lastName ?? "",
    suffix: value?.suffix ?? "",
  };
}

export function NameFields({
  value,
  onChange,
  prefix = "person",
}: {
  value: NameDraft;
  onChange: (value: NameDraft) => void;
  prefix?: string;
}) {
  return (
    <>
      <FormField id={`${prefix}-first-name`} label="First name" required>
        <Input
          id={`${prefix}-first-name`}
          autoComplete="given-name"
          value={value.firstName}
          maxLength={80}
          required
          onChange={(event) => onChange({ ...value, firstName: event.target.value })}
        />
      </FormField>
      <FormField id={`${prefix}-middle-name`} label="Middle name (optional)">
        <Input
          id={`${prefix}-middle-name`}
          autoComplete="additional-name"
          value={value.middleName}
          maxLength={80}
          onChange={(event) => onChange({ ...value, middleName: event.target.value })}
        />
      </FormField>
      <FormField id={`${prefix}-last-name`} label="Last name" required>
        <Input
          id={`${prefix}-last-name`}
          autoComplete="family-name"
          value={value.lastName}
          maxLength={80}
          required
          onChange={(event) => onChange({ ...value, lastName: event.target.value })}
        />
      </FormField>
      <FormField id={`${prefix}-suffix`} label="Name extension / suffix (optional)">
        <Autocomplete
          id={`${prefix}-suffix`}
          autoComplete="honorific-suffix"
          value={value.suffix}
          items={["Jr.", "Sr.", "II", "III", "IV", "V"]}
          maxLength={30}
          aria-describedby={`${prefix}-suffix-hint`}
          onValueChange={(suffix) => onChange({ ...value, suffix })}
        />
        <p id={`${prefix}-suffix-hint`} className="text-xs text-muted-foreground">
          Choose a suggestion or enter your suffix. Leave blank if none.
        </p>
      </FormField>
    </>
  );
}
