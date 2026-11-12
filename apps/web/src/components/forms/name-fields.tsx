import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { Autocomplete } from "@Alumni-Tracking-Ss/ui/components/autocomplete";
import { FormField } from "@/components/forms/form-layout";
import { OptionalFields } from "@/components/forms/optional-fields";

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

type Props = {
  value: NameDraft;
  onChange: (value: NameDraft) => void;
  prefix?: string;
  /** Sign-up layout: the suffix hint stays available to assistive tech only. */
  compact?: boolean;
  /** Middle name and suffix stay hidden behind "+ Add middle name or suffix" until needed. */
  optionalBehindLink?: boolean;
};

export function NameFields({
  value,
  onChange,
  prefix = "person",
  compact = false,
  optionalBehindLink = false,
}: Props) {
  const set = (patch: Partial<NameDraft>) => onChange({ ...value, ...patch });
  const first = (
    <FormField id={`${prefix}-first-name`} label="First name" required>
      <Input
        id={`${prefix}-first-name`}
        autoComplete="given-name"
        value={value.firstName}
        maxLength={80}
        required
        onChange={(event) => set({ firstName: event.target.value })}
      />
    </FormField>
  );
  const middle = (
    <FormField id={`${prefix}-middle-name`} label="Middle name (optional)">
      <Input
        id={`${prefix}-middle-name`}
        autoComplete="additional-name"
        value={value.middleName}
        maxLength={80}
        onChange={(event) => set({ middleName: event.target.value })}
      />
    </FormField>
  );
  const last = (
    <FormField id={`${prefix}-last-name`} label="Last name" required>
      <Input
        id={`${prefix}-last-name`}
        autoComplete="family-name"
        value={value.lastName}
        maxLength={80}
        required
        onChange={(event) => set({ lastName: event.target.value })}
      />
    </FormField>
  );
  const suffix = (
    <FormField id={`${prefix}-suffix`} label="Name extension / suffix (optional)">
      <Autocomplete
        id={`${prefix}-suffix`}
        autoComplete="honorific-suffix"
        value={value.suffix}
        items={["Jr.", "Sr.", "II", "III", "IV", "V"]}
        maxLength={30}
        aria-describedby={`${prefix}-suffix-hint`}
        onValueChange={(next) => set({ suffix: next })}
      />
      <p
        id={`${prefix}-suffix-hint`}
        className={compact || optionalBehindLink ? "sr-only" : "text-xs text-muted-foreground"}
      >
        Choose a suggestion or enter your suffix. Leave blank if none.
      </p>
    </FormField>
  );
  if (optionalBehindLink)
    return (
      <>
        {first}
        {last}
        <OptionalFields
          label="Add middle name or suffix"
          defaultOpen={Boolean(value.middleName || value.suffix)}
          className="sm:col-span-2"
        >
          {middle}
          {suffix}
        </OptionalFields>
      </>
    );
  return (
    <>
      {first}
      {middle}
      {last}
      {suffix}
    </>
  );
}
