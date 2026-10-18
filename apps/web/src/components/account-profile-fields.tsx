import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { NativeSelect } from "@/components/native-select";
import { FormField } from "@/components/page-header";

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
      <FormField id="phone-number" label="Phone number" required>
        <Input
          id="phone-number"
          type="tel"
          placeholder="+639171234567"
          autoComplete="tel"
          required
          minLength={7}
          maxLength={30}
          value={value.phoneNumber}
          onChange={(event) => onChange({ ...value, phoneNumber: event.target.value })}
        />
      </FormField>
      <FormField id="account-gender" label="Gender" required>
        <NativeSelect
          id="account-gender"
          required
          value={value.gender}
          onChange={(event) => onChange({ ...value, gender: event.target.value })}
        >
          <option value="">Select gender</option>
          <option value="Male">Male</option>
          <option value="Female">Female</option>
        </NativeSelect>
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
