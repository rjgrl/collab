import PhoneNumberInput, { getCountryCallingCode, type Country } from "react-phone-number-input";
import { forwardRef, useState, type ComponentProps, type FocusEventHandler } from "react";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { FormSelect } from "@/components/forms/form-select";
import { normalizePhoneNumber } from "@Alumni-Tracking-Ss/contracts/phone";

function CountrySelect({
  value,
  onChange,
  options,
  disabled,
  readOnly,
  onFocus,
  onBlur,
}: {
  value?: Country;
  onChange: (country?: Country) => void;
  options: { value?: Country; label: string; divider?: boolean }[];
  disabled?: boolean;
  readOnly?: boolean;
  onFocus?: FocusEventHandler<HTMLButtonElement>;
  onBlur?: FocusEventHandler<HTMLButtonElement>;
}) {
  return (
    <FormSelect
      aria-label="Country Calling Code"
      title={options.find((option) => option.value === value)?.label ?? "International"}
      className="h-auto w-24 shrink-0 self-stretch rounded-r-none border-0 border-r bg-transparent px-2 text-sm dark:bg-transparent"
      contentClassName="w-72 max-w-[calc(100vw-2rem)]"
      displayValue={value ? `${value} +${getCountryCallingCode(value)}` : "Intl."}
      value={value ?? ""}
      onValueChange={(country) => onChange((country || undefined) as Country | undefined)}
      disabled={disabled || readOnly}
      onFocus={onFocus}
      onBlur={onBlur}
      items={options.map((option) => ({
        value: option.value ?? "",
        label: `${option.label}${option.value ? ` (+${getCountryCallingCode(option.value)})` : ""}`,
        disabled: option.divider,
      }))}
    />
  );
}

// Philippine national-input invariants: docs/specs/account-access.md.
const NationalPhoneField = forwardRef<
  HTMLInputElement,
  ComponentProps<typeof Input> & { "data-country"?: Country }
>(function NationalPhoneField({ "data-country": country, value, onChange, ...props }, ref) {
  const normalize = (text: string) => (country === "PH" ? text.replace(/^0/, "") : text);
  return (
    <Input
      {...props}
      ref={ref}
      value={normalize(String(value ?? ""))}
      onChange={(event) => {
        const raw = event.currentTarget.value;
        const normalized = normalize(raw);
        if (normalized !== raw) event.currentTarget.value = normalized;
        onChange?.(event);
      }}
    />
  );
});

export function PhoneInput({
  value,
  onChange,
  onBlur,
  placeholder = "Enter Phone Number",
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "ref" | "onBlur"> & {
  value: string;
  onChange: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLElement>;
}) {
  const [country, setCountry] = useState<Country | undefined>("PH");
  return (
    <PhoneNumberInput
      {...props}
      className="flex min-w-0 rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25"
      defaultCountry="PH"
      onCountryChange={setCountry}
      smartCaret={false}
      initialValueFormat="national"
      countrySelectComponent={CountrySelect}
      inputComponent={NationalPhoneField}
      numberInputProps={{
        "data-country": country,
        className:
          "min-w-0 flex-1 rounded-l-none rounded-r-lg border-0 bg-transparent focus-visible:ring-0 focus-visible:outline-none! dark:bg-transparent",
      }}
      placeholder={placeholder}
      value={value || undefined}
      onChange={(number) =>
        onChange(number?.startsWith("+630") ? "+63" + number.slice(4) : (number ?? ""))
      }
      onBlur={(event) => {
        const normalized = normalizePhoneNumber(value);
        if (normalized !== value) onChange(normalized);
        onBlur?.(event);
      }}
    />
  );
}
