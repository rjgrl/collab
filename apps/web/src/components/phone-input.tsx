import PhoneNumberInput, { getCountryCallingCode, type Country } from "react-phone-number-input";
import type { ComponentProps, FocusEventHandler } from "react";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { NativeSelect } from "./native-select";
import { ChevronDown } from "lucide-react";

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
  onFocus?: FocusEventHandler<HTMLSelectElement>;
  onBlur?: FocusEventHandler<HTMLSelectElement>;
}) {
  return (
    <div className="relative flex w-24 shrink-0 items-center justify-between gap-1 self-stretch border-r border-input px-2 text-sm">
      <span aria-hidden="true" className="whitespace-nowrap">
        {value ? `${value} +${getCountryCallingCode(value)}` : "Intl."}
      </span>
      <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
      <NativeSelect
        aria-label="Country calling code"
        title={options.find((option) => option.value === value)?.label ?? "International"}
        className="absolute inset-0 h-full cursor-pointer rounded-l-lg rounded-r-none border-0 opacity-0"
        value={value ?? ""}
        onChange={(event) => onChange((event.target.value || undefined) as Country | undefined)}
        disabled={disabled || readOnly}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {options.map((option) => (
          <option
            key={option.value ?? "international"}
            value={option.value ?? ""}
            disabled={option.divider}
          >
            {option.label}
            {option.value ? ` (+${getCountryCallingCode(option.value)})` : ""}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

export function PhoneInput({
  value,
  onChange,
  ...props
}: Omit<ComponentProps<typeof Input>, "value" | "onChange" | "ref"> & {
  value: string;
  onChange: (value: string) => void;
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
    />
  );
}
