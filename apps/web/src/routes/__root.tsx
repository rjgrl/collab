import { Toaster } from "@Alumni-Tracking-Ss/ui/components/sonner";
import type { QueryClient } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { HeadContent, Outlet, createRootRouteWithContext } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";

import { ThemeProvider } from "@/components/theme-provider";
import { api } from "@/utils/api";

import "../index.css";

export interface RouterAppContext {
  api: typeof api;
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterAppContext>()({
  component: RootComponent,
  head: () => ({
    meta: [
      {
        title: "Alumni Tracking System",
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
  return (
    <>
      <HeadContent />
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        disableTransitionOnChange
        storageKey="vite-ui-theme"
      >
        <Outlet />
        <Toaster
          richColors
          expand
          closeButton
          position="top-center"
          offset={{ top: 80 }}
          mobileOffset={{ top: 80 }}
        />
      </ThemeProvider>
      {import.meta.env.DEV ? <TanStackRouterDevtools position="bottom-left" /> : null}
      {import.meta.env.DEV ? (
        <ReactQueryDevtools position="bottom" buttonPosition="bottom-right" />
      ) : null}
    </>
  );
}
