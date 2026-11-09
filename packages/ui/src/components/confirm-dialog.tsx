import { AlertDialog } from "@base-ui/react/alert-dialog";
import { TriangleAlert } from "lucide-react";

import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";

/** Accessible in-app replacement for window.confirm(); focus starts on Cancel. */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onResult,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onResult: (confirmed: boolean) => void;
}) {
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onResult(false);
      }}
    >
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px]" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-2xl border bg-card p-6 shadow-2xl outline-none">
          <div className="flex gap-4">
            <span
              aria-hidden="true"
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-full",
                destructive
                  ? "bg-destructive/10 text-destructive"
                  : "bg-accent text-accent-foreground",
              )}
            >
              <TriangleAlert className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5 pt-1">
              <AlertDialog.Title className="text-base font-semibold tracking-tight">
                {title}
              </AlertDialog.Title>
              {description ? (
                <AlertDialog.Description className="text-sm text-muted-foreground">
                  {description}
                </AlertDialog.Description>
              ) : null}
            </div>
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Close render={<Button variant="outline" />}>
              {cancelLabel}
            </AlertDialog.Close>
            <Button
              className={cn(
                destructive &&
                  "bg-destructive text-destructive-foreground hover:bg-destructive/90 focus-visible:ring-destructive/40",
              )}
              onClick={() => onResult(true)}
            >
              {confirmLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
