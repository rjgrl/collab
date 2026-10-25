import { isManagedLocalDatabaseUrl } from "./local-testing";
export function contactVerificationPolicy(settings: NodeJS.ProcessEnv = process.env) {
  const requirement = (key: string) => {
    const value = settings[key];
    if (value !== undefined && value !== "" && value !== "true" && value !== "false")
      throw new Error(`${key} must be true or false.`);
    return value !== "false";
  };
  const email = requirement("LOCAL_REQUIRE_EMAIL_VERIFICATION");
  const phone = requirement("LOCAL_REQUIRE_PHONE_VERIFICATION");
  const localBypass = !email || !phone;
  if (localBypass) {
    if (!["development", "test"].includes(settings.NODE_ENV ?? ""))
      throw new Error("Contact-verification exemptions are development-only.");
    if (!isManagedLocalDatabaseUrl(settings.DATABASE_URL))
      throw new Error(
        "Contact-verification exemptions require managed loopback MongoDB rs0 on port 27018.",
      );
  }
  return { email, phone, localBypass };
}
