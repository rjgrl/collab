import PhoneNumberInput, { getCountryCallingCode, type Country } from "react-phone-number-input";
import type { ComponentProps, FocusEventHandler } from "react";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { FormSelect } from "./form-select";
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
      aria-label="Country calling code"
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

export function PhoneInput({
  value,
  onChange,
  onBlur,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "ref" | "onBlur"> & {
  value: string;
  onChange: (value: string) => void;
  onBlur?: FocusEventHandler<HTMLElement>;
}) {
  return (
    <PhoneNumberInput
      {...props}
      className="flex min-w-0 rounded-lg border border-input bg-card focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/25"
      defaultCountry="PH"
      initialValueFormat="national"
      countrySelectComponent={CountrySelect}
      inputComponent={Input}
      numberInputProps={{
        className:
          "min-w-0 flex-1 rounded-l-none rounded-r-lg border-0 bg-transparent focus-visible:ring-0 focus-visible:outline-none! dark:bg-transparent",
      }}
      placeholder="Enter phone number"
      value={value || undefined}
      onChange={(number) => onChange(number ?? "")}
      onBlur={(event) => {
        const normalized = normalizePhoneNumber(value);
        if (normalized !== value) onChange(normalized);
        onBlur?.(event);
      }}
    />
  );
}
