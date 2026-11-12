import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/layout/brand-mark";

const HIGHLIGHTS = [
  "Alumni keep their own profile and employment current",
  "Faculty follow up with the alumni assigned to them",
  "Heads see tracking progress across their departments",
];

/**
 * Signed-out and pre-app pages: navy brand panel beside the form on large screens,
 * a compact brand row above the form below the lg breakpoint. Pages own their h1.
 */
export function AuthLayout({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <main className="grid min-h-svh bg-card lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col">
        <img
          src="/brand/cot-building.webp"
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 size-full object-cover object-center"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-sidebar/75"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-linear-to-b from-sidebar/35 via-sidebar/65 to-sidebar"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -left-24 size-96 rounded-full bg-sidebar-primary/15 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-40 size-[28rem] rounded-full bg-sidebar-accent blur-3xl"
        />
        <p className="relative z-10 flex items-center gap-3 text-sm font-semibold text-sidebar-accent-foreground">
          <BrandMark />
          Alumni tracking system
        </p>
        <div className="relative z-10 mt-auto max-w-md">
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
      <div
        className={cn(
          "flex min-w-0 flex-col items-center px-4 sm:px-8 lg:justify-center lg:px-12",
          wide ? "py-6 sm:py-8 lg:py-4" : "py-8 sm:py-12",
        )}
      >
        <div className={cn("flex w-full flex-col", wide ? "max-w-3xl" : "max-w-md")}>
          <p
            className={cn(
              "flex items-center gap-3 text-sm font-semibold lg:hidden",
              wide ? "mb-6" : "mb-8",
            )}
          >
            <BrandMark className="size-9" />
            Alumni tracking system
          </p>
          {children}
        </div>
      </div>
    </main>
  );
}

/** Heading block shared by auth pages. */
export function AuthHeader({
  title,
  description,
  className,
}: {
  title: string;
  description?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-6 flex flex-col gap-2", className)}>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem] sm:leading-9">
        {title}
      </h1>
      {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
    </div>
  );
}
