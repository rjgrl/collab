import type { Request } from "express";
import { z } from "zod";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";

export type InputSource = "body" | "query" | "params" | "combined" | "none";
export function validatedInput<T>(request: Request, schema: z.ZodType<T>, source: InputSource): T {
  let value: unknown;
  if (source === "none") value = undefined;
  else if (source === "combined") {
    const body: unknown = request.body;
    if (body !== undefined && (!body || typeof body !== "object" || Array.isArray(body)))
      throw new ApiError("BAD_REQUEST", { message: "Expected a JSON object." });
    if (body && Object.keys(request.params).some((key) => key in body))
      throw new ApiError("BAD_REQUEST", {
        message: "Record IDs must be supplied in the URL only.",
      });
    value = { ...body, ...request.params };
  } else value = request[source];
  return schema.parse(value);
}
