import { Checkbox } from "@Alumni-Tracking-Ss/ui/components/checkbox";
import type { ReactNode } from "react";

export function CheckboxRow({
  checked,
  onCheckedChange,
  children,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={(value) => onCheckedChange(value === true)} className="mt-0.5" />
      <span>{children}</span>
    </label>
  );
}
