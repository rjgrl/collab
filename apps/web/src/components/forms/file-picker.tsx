import { Upload } from "lucide-react";
import { buttonVariants } from "@Alumni-Tracking-Ss/ui/components/button";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";

export function FilePicker({
  id,
  file,
  accept,
  required,
  disabled,
  onChange,
  chooseLabel = "Choose file",
  accessibleLabel,
  describedBy,
}: {
  id: string;
  file?: File | null;
  accept?: string;
  required?: boolean;
  disabled?: boolean;
  onChange: (file?: File) => void;
  chooseLabel?: string;
  accessibleLabel?: string;
  describedBy?: string;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-3">
      <input
        id={id}
        className="sr-only"
        type="file"
        accept={accept}
        required={required}
        disabled={disabled}
        aria-label={accessibleLabel}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.currentTarget.files?.[0])}
      />
      <label
        htmlFor={id}
        aria-disabled={disabled || undefined}
        className={cn(
          buttonVariants({ variant: "outline", size: "sm" }),
          "cursor-pointer",
          disabled && "pointer-events-none opacity-50",
        )}
      >
        <Upload className="size-4" />
        {chooseLabel}
      </label>
      <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
        {file?.name ?? "No file chosen"}
      </span>
    </div>
  );
}
