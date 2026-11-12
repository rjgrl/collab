import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@Alumni-Tracking-Ss/ui/components/card";
import { Label } from "@Alumni-Tracking-Ss/ui/components/label";
import type { ComponentProps, ReactNode } from "react";

export function FormCard({
  title,
  description,
  children,
}: {
  title?: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      {title ? (
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
      ) : null}
      <CardContent className={title ? undefined : "pt-0"}>{children}</CardContent>
    </Card>
  );
}

export function FormField({
  id,
  label,
  children,
  error,
  required,
}: {
  id: string;
  label: string;
  children: ReactNode;
  error?: string;
  required?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5" data-invalid={error ? true : undefined}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span className="text-destructive" aria-hidden="true">
            *
          </span>
        ) : null}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Small uppercase legend that groups the compact sign-up sections. */
export const SECTION_LEGEND =
  "mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase";

/**
 * Legend for a numbered form group ("1  About you"). The number is decorative; the group's
 * accessible name is the text alone.
 */
export function NumberedLegend({ step, children }: { step: number; children: ReactNode }) {
  return (
    <legend className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
      <span
        aria-hidden="true"
        className="flex size-6 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
      >
        {step}
      </span>
      {children}
    </legend>
  );
}

export function FormActions({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-2 pt-2 md:col-span-2">{children}</div>;
}

export function FieldsetLabel({ children }: { children: ReactNode }) {
  return <p className="text-sm font-medium leading-snug">{children}</p>;
}

export function PrimaryButton({
  pending,
  pendingLabel = "Saving",
  children,
  ...props
}: ComponentProps<typeof Button> & { pending?: boolean; pendingLabel?: string }) {
  return (
    <Button {...props} disabled={pending || props.disabled}>
      {pending ? `${pendingLabel}...` : children}
    </Button>
  );
}
