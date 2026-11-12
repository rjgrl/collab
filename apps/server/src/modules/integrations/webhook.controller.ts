import type { RequestHandler } from "express";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { isIntegrationEnabled } from "@Alumni-Tracking-Ss/api/integrations/registry";
import { acceptFormsSubmission } from "@Alumni-Tracking-Ss/api/services/forms";
import { requestContext } from "../../middleware/request-context";

export const formsWebhookController: RequestHandler = async (request, response) => {
  const { db, integrationEnv } = requestContext(request);
  if (!(await isIntegrationEnabled(db, "google_forms")))
    throw new ApiError("FORBIDDEN", { message: "Google Forms integration is disabled." });
  const expected = integrationEnv.googleFormsWebhookSecret;
  const actual = request.get("x-webhook-secret");
  if (
    !expected ||
    !actual ||
    Buffer.byteLength(actual) !== Buffer.byteLength(expected) ||
    !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
  )
    throw new ApiError("UNAUTHORIZED", { message: "Invalid webhook secret." });
  const payload = z.record(z.string(), z.unknown()).parse(request.body);
  response.json(await acceptFormsSubmission(db, request.get("idempotency-key"), payload));
};
