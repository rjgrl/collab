import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { MulterError } from "multer";
import { ApiError } from "@Alumni-Tracking-Ss/api/http-error";
import { isDatabaseUnavailable } from "@Alumni-Tracking-Ss/api/errors";

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (response.headersSent) return _next(error);
  let status = 500;
  let code = "INTERNAL_SERVER_ERROR";
  let message = "Request failed.";
  if (error instanceof ApiError) {
    status = error.status;
    code = error.code;
    message = error.message;
    if (status === 429)
      response.setHeader("Retry-After", String(error.data?.retryAfterSeconds ?? 900));
  } else if (error instanceof ZodError) {
    status = 400;
    code = "BAD_REQUEST";
    message = error.issues
      .map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`)
      .slice(0, 4)
      .join("; ");
  } else if (error instanceof MulterError) {
    status = error.code === "LIMIT_FILE_SIZE" ? 413 : 400;
    code = status === 413 ? "PAYLOAD_TOO_LARGE" : "BAD_REQUEST";
    message = status === 413 ? "File must be 10 MB or smaller." : "Invalid upload.";
  } else if (error instanceof SyntaxError) {
    status = 400;
    code = "BAD_REQUEST";
    message = "Invalid JSON request body.";
  } else if (
    typeof error === "object" &&
    error &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    status = 413;
    code = "PAYLOAD_TOO_LARGE";
    message = "Request body is too large.";
  } else if (typeof error === "object" && error && "code" in error && error.code === 11000) {
    status = 409;
    code = "CONFLICT";
    message = "An account or record with this identifier already exists.";
  } else if (
    typeof error === "object" &&
    error &&
    "name" in error &&
    ["CastError", "ValidationError"].includes(String(error.name))
  ) {
    status = 400;
    code = "BAD_REQUEST";
    message = "Invalid record data.";
  } else if (isDatabaseUnavailable(error)) {
    status = 503;
    code = "SERVICE_UNAVAILABLE";
    message = "The database is unavailable. Try again shortly.";
  }
  if (status >= 500)
    console.error(
      JSON.stringify({
        event: "request_failed",
        code,
        requestId: response.getHeader("X-Request-ID"),
      }),
    );
  response
    .status(status)
    .json({ error: message, code, requestId: response.getHeader("X-Request-ID") });
};
