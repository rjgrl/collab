import type { RequestHandler } from "express";
import { requireUser } from "@Alumni-Tracking-Ss/api/access";
import { requestContext } from "./request-context";

export const authenticate: RequestHandler = (request, _response, next) => {
  requireUser(requestContext(request));
  next();
};
