import { NoticeDialog } from "@Alumni-Tracking-Ss/ui/components/notice-dialog";
import { useRouter } from "@tanstack/react-router";
import { Clock } from "lucide-react";

import { queryClient } from "@/lib/api";
import { clearSessionEnded, safeReturnPath, useSessionEnded } from "@/lib/session-ended";

/** Tells the user their session ended; Okay leads to sign-in and back to the same page after. */
export function SessionEndedDialog() {
  const open = useSessionEnded();
  const router = useRouter();

  async function signInAgain() {
    const { pathname, searchStr, hash } = router.state.location;
    clearSessionEnded();
    queryClient.clear();
    // Already on sign-in (the app sent the user here), which keeps its own return address.
    if (pathname === "/login") return;
    const redirect = safeReturnPath(`${pathname}${searchStr}${hash ? `#${hash}` : ""}`);
    await router.navigate({ to: "/login", search: redirect ? { redirect } : {} });
  }

  return (
    <NoticeDialog
      open={open}
      icon={Clock}
      title="Your session has ended"
      description="For your security, you were signed out. Sign in again to continue where you left off."
      actionLabel="Okay"
      onAction={() => void signInAgain()}
    />
  );
}
