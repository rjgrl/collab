import type { RouterClient } from "@orpc/server";

import { publicProcedure } from "../index";
import { departmentsRouter, facultiesRouter, programsRouter } from "./academic";
import { alumniRouter } from "./alumni";
import { auditRouter, dashboardRouter, filesRouter, integrationsRouter, reportsRouter } from "./dashboard";
import { authRouter, permissionsRouter, rolesRouter, usersRouter } from "./rbac";

export const appRouter = {
  healthCheck: publicProcedure.handler(() => {
    return "OK";
  }),
  auth: authRouter,
  users: usersRouter,
  roles: rolesRouter,
  permissions: permissionsRouter,
  departments: departmentsRouter,
  programs: programsRouter,
  faculties: facultiesRouter,
  alumni: alumniRouter,
  dashboard: dashboardRouter,
  reports: reportsRouter,
  integrations: integrationsRouter,
  audit: auditRouter,
  files: filesRouter,
};

export type AppRouter = typeof appRouter;
export type AppRouterClient = RouterClient<typeof appRouter>;
