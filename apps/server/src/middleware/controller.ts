import type { RequestHandler } from "express";
import type { z } from "zod";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { validatedInput, type InputSource } from "./validate";
import { requestContext } from "./request-context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";

export function controller<I, O>(
  contract: { input: z.ZodType<I>; output: z.ZodType<O> },
  service: (context: Context, input: I) => Promise<unknown> | unknown,
  source: InputSource,
  status = 200,
): RequestHandler {
  return async (request, response) => {
    const input = validatedInput(request, contract.input, source);
    const result = await service(requestContext(request), input);
    const output = contract.output.safeParse(result);
    if (!output.success)
      throw new ApiError("INTERNAL_SERVER_ERROR", { message: "Invalid server response." });
    response.status(status).json(output.data);
  };
}
