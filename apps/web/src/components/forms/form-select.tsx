import type { ComponentProps, ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@Alumni-Tracking-Ss/ui/components/select";

export function FormSelect({
  value,
  onValueChange,
  items,
  name,
  required,
  disabled,
  displayValue,
  contentClassName,
  ...props
}: Omit<ComponentProps<typeof SelectTrigger>, "value" | "onChange" | "children"> & {
  value: string;
  onValueChange: (value: string) => void;
  items: { value: string; label: string; disabled?: boolean }[];
  name?: string;
  required?: boolean;
  displayValue?: ReactNode;
  contentClassName?: string;
}) {
  return (
    <Select
      value={value}
      onValueChange={(next) => onValueChange(next ?? "")}
      items={items}
      name={name ?? props.id}
      required={required}
      disabled={disabled}
    >
      <SelectTrigger {...props} aria-required={required || undefined}>
        <SelectValue>{displayValue}</SelectValue>
      </SelectTrigger>
      <SelectContent className={contentClassName}>
        {items.map((item) => (
          <SelectItem
            key={item.value}
            value={item.value}
            data-value={item.value}
            disabled={item.disabled}
          >
            {item.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
