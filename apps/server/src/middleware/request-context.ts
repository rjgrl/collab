import type { Request } from "express";
import type { Context } from "@Alumni-Tracking-Ss/api/context";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";

const contexts = new WeakMap<Request, Context>();
export function setRequestContext(request: Request, context: Context) {
  contexts.set(request, context);
}
export function requestContext(request: Request): Context {
  const context = contexts.get(request);
  if (!context) throw new ApiError("INTERNAL_SERVER_ERROR");
  return context;
}
