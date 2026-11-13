import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Link, useRouter } from "@tanstack/react-router";
import { ArrowLeft, FileQuestion, RefreshCw, ServerCrash, ShieldX } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { createContext, useContext, type ReactNode } from "react";

import { BrandMark } from "@/components/layout/brand-mark";

/** True inside the signed-in app shell, which already shows the brand and navigation. */
export const InAppShell = createContext(false);

/** Shared layout for 403, 404 and error pages; adds the brand when shown full-screen. */
function StatusPage({
  code,
  icon: Icon,
  title,
  description,
  actions,
}: {
  code: string;
  icon: LucideIcon;
  title: string;
  description: string;
  actions: ReactNode;
}) {
  const framed = !useContext(InAppShell);
  const body = (
    <section
      aria-labelledby="status-title"
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-5 px-4 py-12 text-center sm:py-16"
    >
      <span
        aria-hidden="true"
        className="flex size-16 items-center justify-center rounded-2xl bg-accent text-accent-foreground"
      >
        <Icon className="size-8" />
      </span>
      <p className="text-sm font-semibold tracking-wider text-muted-foreground uppercase">
        Error {code}
      </p>
      <h1 id="status-title" className="text-2xl font-semibold tracking-tight sm:text-3xl">
        {title}
      </h1>
      <p className="max-w-md text-sm leading-6 text-muted-foreground sm:text-base">{description}</p>
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row">{actions}</div>
    </section>
  );
  if (!framed) return body;
  return (
    <main className="flex min-h-svh flex-col bg-background">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3 sm:px-8">
        <BrandMark className="size-9" />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Bukidnon State University</p>
          <p className="truncate text-xs text-muted-foreground">Alumni tracking system</p>
        </div>
      </header>
      <div className="flex flex-1 items-center">{body}</div>
    </main>
  );
}

function BackButton() {
  return (
    <Button variant="outline" onClick={() => window.history.back()}>
      <ArrowLeft aria-hidden="true" /> Go back
    </Button>
  );
}

function HomeButton({ variant }: { variant?: "outline" }) {
  // "/" sends signed-in users to their start page and everyone else to sign-in.
  return (
    <Button variant={variant} nativeButton={false} render={<Link to="/" />}>
      Go to home page
    </Button>
  );
}

export function NotFoundPage() {
  return (
    <StatusPage
      code="404"
      icon={FileQuestion}
      title="Page not found"
      description="The link may be old or mistyped, or the page may have moved. Check the address, or start again from the home page."
      actions={
        <>
          <BackButton />
          <HomeButton />
        </>
      }
    />
  );
}

/** Shown inside the app shell when the signed-in role cannot use the page. */
export function AccessDeniedPage() {
  return (
    <StatusPage
      code="403"
      icon={ShieldX}
      title="Access denied"
      description="Your role doesn't include this page. If you need it for your work, ask an administrator to review your role."
      actions={
        <>
          <BackButton />
          <HomeButton />
        </>
      }
    />
  );
}

/** Shown when a page fails to load or the server cannot be reached. Details stay out of view. */
export function ErrorPage({ reset }: { reset?: () => void }) {
  const router = useRouter();
  return (
    <StatusPage
      code="500"
      icon={ServerCrash}
      title="Something went wrong"
      description="We couldn't load this page. Check your connection and try again. If it keeps happening, contact the system administrator."
      actions={
        <>
          <HomeButton variant="outline" />
          <Button
            onClick={() => {
              reset?.();
              void router.invalidate();
            }}
          >
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </>
      }
    />
  );
}
