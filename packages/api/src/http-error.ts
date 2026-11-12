import { HTTP_STATUS } from "@Alumni-Tracking-Ss/contracts/common";

export class ApiError extends Error {
  readonly status: number;
  readonly data?: { retryAfterSeconds?: number };
  constructor(
    readonly code: keyof typeof HTTP_STATUS,
    options: { message?: string; data?: { retryAfterSeconds?: number } } = {},
  ) {
    super(options.message ?? code.replaceAll("_", " "));
    this.name = "ApiError";
    this.status = HTTP_STATUS[code];
    this.data = options.data;
  }
}
