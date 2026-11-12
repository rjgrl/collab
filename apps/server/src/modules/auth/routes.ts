import { Router } from "express";
import { authenticate } from "../../middleware/authenticate";
import { authController } from "./controller";

export function authRoutes(secureCookies: boolean) {
  const router = Router();
  const auth = authController(secureCookies);
  router.get("/config", auth.config);
  router.get("/registration-programs", auth.registrationPrograms);
  router.get("/me", auth.me);
  router.post("/login", auth.login);
  router.post("/signup", auth.signup);
  router.post("/logout", auth.logout);
  router.post("/password-reset-requests", auth.forgotPassword);
  router.post("/password-resets", auth.resetPassword);
  router.get("/mfa", authenticate, auth.mfaStatus);
  router.post("/mfa/enrollments", authenticate, auth.beginMfa);
  router.post("/mfa/confirmations", authenticate, auth.confirmMfa);
  router.post("/mfa/verifications", authenticate, auth.verifyMfa);
  router.get("/verification", authenticate, auth.verificationStatus);
  router.post("/verification-challenges", authenticate, auth.sendVerification);
  router.post("/verification-confirmations", authenticate, auth.confirmVerification);
  router.post("/password", authenticate, auth.createGooglePassword);
  router.patch("/profile-completion", authenticate, auth.completeProfile);
  router.patch("/profile", authenticate, auth.updateProfile);
  router.patch("/password", authenticate, auth.changePassword);
  router.post("/email-change-challenges", authenticate, auth.requestEmailChange);
  router.post("/email-change-confirmations", authenticate, auth.confirmEmailChange);
  return router;
}
