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
