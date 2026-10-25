import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { FormSelect } from "@/components/form-select";
import { FormField } from "@/components/page-header";
import { PhoneInput } from "./phone-input";

export type AccountProfile = { phoneNumber: string; gender: string; facebookAccount: string };

export function AccountProfileFields({
  value,
  onChange,
}: {
  value: AccountProfile;
  onChange: (value: AccountProfile) => void;
}) {
  return (
    <>
      <div>
        <FormField id="phone-number" label="Phone number" required>
          <PhoneInput
            id="phone-number"
            type="tel"
            autoComplete="tel"
            required
            minLength={7}
            maxLength={30}
            value={value.phoneNumber}
            onChange={(phoneNumber) => onChange({ ...value, phoneNumber })}
            aria-describedby="phone-number-hint"
          />
        </FormField>
        <p id="phone-number-hint" className="mt-2 text-xs text-muted-foreground">
          Select a country or paste an international number.
        </p>
      </div>
      <FormField id="account-gender" label="Gender" required>
        <FormSelect
          id="account-gender"
          required
          value={value.gender}
          onValueChange={(selected) => onChange({ ...value, gender: selected })}
          items={[
            { value: "", label: "Select gender" },
            { value: "Male", label: "Male" },
            { value: "Female", label: "Female" },
          ]}
        />
      </FormField>
      <FormField id="facebook-profile" label="Facebook profile link (optional)">
        <Input
          id="facebook-profile"
          type="url"
          maxLength={2048}
          placeholder="https://www.facebook.com/username"
          value={value.facebookAccount}
          onChange={(event) => onChange({ ...value, facebookAccount: event.target.value })}
        />
      </FormField>
    </>
  );
}
