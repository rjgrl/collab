import { Plus } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";

/**
 * Keeps optional fields out of the way until someone wants them: a "+ Add …" link that reveals
 * its fields in place and moves focus to the first one. Starts open when a value is already
 * filled in, and never closes again, so nothing typed can disappear from view.
 */
export function OptionalFields({
  label,
  defaultOpen = false,
  className,
  children,
}: {
  /** Shown after the plus sign, for example "Add middle name or suffix". */
  label: string;
  defaultOpen?: boolean;
  /** Layout classes for the link and, once open, the fields' box (for example a column span). */
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [focusFirst, setFocusFirst] = useState(false);
  const fields = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focusFirst) return;
    fields.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    setFocusFirst(false);
  }, [focusFirst]);
  if (open)
    return (
      // A real grid box (not display: contents, which broke Base UI popups' focus handling).
      <div ref={fields} className={cn("grid gap-3 sm:grid-cols-2", className)}>
        {children}
      </div>
    );
  return (
    <button
      type="button"
      aria-expanded={false}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 justify-self-start rounded-md text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        className,
      )}
      onClick={() => {
        setOpen(true);
        setFocusFirst(true);
      }}
    >
      <Plus aria-hidden="true" className="size-4" />
      {label}
    </button>
  );
}
