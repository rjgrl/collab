import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider, createRouter } from "@tanstack/react-router";
import ReactDOM from "react-dom/client";

import { PageSkeleton } from "@/components/layout/page-skeleton";
import { ErrorPage, NotFoundPage } from "@/components/feedback/status-page";
import { routeTree } from "./routeTree.gen";
import { api, queryClient } from "@/lib/api";

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  defaultPendingComponent: () => <PageSkeleton className="p-4 sm:p-8" />,
  defaultErrorComponent: ({ reset }) => <ErrorPage reset={reset} />,
  defaultNotFoundComponent: NotFoundPage,
  context: { api, queryClient },
  Wrap: function WrapComponent({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<RouterProvider router={router} />);
}
