import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import { Check, GraduationCap } from "lucide-react";
import type { ReactNode } from "react";

const HIGHLIGHTS = [
  "Alumni keep their own profile and employment current",
  "Faculty follow up with the alumni assigned to them",
  "Heads see tracking progress across their departments",
];

function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-xl bg-sidebar-accent text-sidebar-accent-foreground ring-1 ring-sidebar-border",
        className,
      )}
    >
      <GraduationCap className="size-5" />
    </span>
  );
}

/**
 * Signed-out and pre-app pages: navy brand panel beside the form on large screens,
 * a compact brand row above the form below the lg breakpoint. Pages own their h1.
 */
export function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="grid min-h-svh bg-card lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-sidebar-primary/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-40 size-[28rem] rounded-full bg-sidebar-accent blur-3xl"
        />
        <p className="relative flex items-center gap-3 text-sm font-semibold text-sidebar-accent-foreground">
          <BrandMark />
          Alumni Tracking System
        </p>
        <div className="relative mt-auto max-w-md">
          <p className="text-3xl leading-tight font-semibold tracking-tight text-balance text-sidebar-accent-foreground">
            Keep every graduate&apos;s story connected to the university.
          </p>
          <p className="mt-3 text-base text-sidebar-foreground">
            One registry for alumni profiles, employment and evidence across every college.
          </p>
          <ul className="mt-8 flex flex-col gap-3 text-sm">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-sidebar-primary"
                >
                  <Check className="size-3.5" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex min-w-0 flex-col items-center px-4 py-8 sm:px-8 sm:py-12 lg:justify-center lg:px-12">
        <div className={cn("flex w-full flex-col", wide ? "max-w-2xl" : "max-w-md")}>
          <p className="mb-8 flex items-center gap-3 text-sm font-semibold lg:hidden">
            <BrandMark className="size-9 rounded-lg bg-sidebar" />
            Alumni Tracking System
          </p>
          {children}
        </div>
      </div>
    </main>
  );
}

/** Heading block shared by auth pages. */
export function AuthHeader({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem] sm:leading-9">
        {title}
      </h1>
      {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
    </div>
  );
}
