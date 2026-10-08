import type { AppRouterClient } from "@Alumni-Tracking-Ss/api/routers/index";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { ENV } from "../env";

function toToastMessage(error: Error) {
  const message = error.message;
  if (
    message.includes("not valid JSON") ||
    message.includes("Unexpected token") ||
    message.includes("Internal Server")
  ) {
    return "Unable to reach the database. Check that MongoDB Atlas is running and this network is allowed.";
  }
  return message;
}

export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(toToastMessage(error), {
          action: {
            label: "Retry",
            onClick: () => {
              query.invalidate();
            },
          },
        });
      },
    }),
  });
}

export const queryClient = createQueryClient();

export const link = new RPCLink({
  url: `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/rpc`,
  fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

export const client: AppRouterClient = createORPCClient(link);

export const orpc = createTanstackQueryUtils(client);
