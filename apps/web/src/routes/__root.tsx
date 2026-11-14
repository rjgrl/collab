import { Toaster } from "@Alumni-Tracking-Ss/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ConfirmProvider } from "@/components/feedback/confirm-provider";
import { SessionEndedDialog } from "@/components/feedback/session-ended-dialog";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { api } from "@/lib/api";

import "../index.css";

const PHONE_QUERY = "(max-width: 639px)";
/** On phones, toasts sit at the top so they never cover actions at the bottom of the screen. */
function useToastPosition() {
  const phone = useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(PHONE_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false,
  );
  return phone ? "top-center" : "bottom-right";
}

export interface RouterAppContext {
  api: typeof api;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "Alumni tracking system",
      },
      {
        name: "description",
        content: "Graduate tracking, academic structure, and RBAC for alumni records",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
      },
    ],
  }),
});

function RootComponent() {
  const toastPosition = useToastPosition();
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <ConfirmProvider>
          <Outlet />
        </ConfirmProvider>
        <SessionEndedDialog />
        <Toaster richColors closeButton visibleToasts={3} position={toastPosition} />
      </ThemeProvider>
      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-left" /> : null}
      {import.meta.env.DEV ? (
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
      ) : null}
    </>
  );
}
