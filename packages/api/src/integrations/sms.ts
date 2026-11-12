import { ApiError } from "../http-error";
import type { IntegrationEnv } from "../context";

// SMS delivery is deliberately unconnected. A real provider must be wired at
// server startup before phone ownership can be verified. No fallback accepts codes.
export function smsConfigured(env: IntegrationEnv) {
  return Boolean(env.smsProvider);
}
function provider(env: IntegrationEnv) {
  if (!env.smsProvider)
    throw new ApiError("SERVICE_UNAVAILABLE", {
      message: "SMS delivery is not connected yet. Phone verification cannot be completed.",
    });
  return env.smsProvider;
}
export async function sendPhoneCode(env: IntegrationEnv, phone: string) {
  return provider(env).sendCode(phone);
}
export async function checkPhoneCode(
  env: IntegrationEnv,
  sid: string,
  phone: string,
  code: string,
) {
  return provider(env).checkCode(sid, phone, code);
}
