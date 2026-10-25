import type { RequestHandler } from "express";
import type { PermissionKey } from "@Alumni-Tracking-Ss/db";
import { requireAccess, rejectAlumniManagement } from "@Alumni-Tracking-Ss/api/access";
import { requestContext } from "./request-context";

export function authorize(permission?: PermissionKey, management = true): RequestHandler {
  return (request, _response, next) => {
    const context = requestContext(request);
    requireAccess(context, permission);
    if (management) rejectAlumniManagement(context);
    next();
  };
}
