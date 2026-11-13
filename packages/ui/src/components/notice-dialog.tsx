import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { LucideIcon } from "lucide-react";

import { Button } from "@Alumni-Tracking-Ss/ui/components/button";

/** A message the user must acknowledge; its single action is the only way to close it. */
export function NoticeDialog({
  open,
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  open: boolean;
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <AlertDialog.Root open={open}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-slate-950/50 backdrop-blur-[2px]" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 flex-col gap-5 rounded-2xl border bg-card p-6 shadow-2xl outline-none">
          <div className="flex gap-4">
            <span
              aria-hidden="true"
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
            >
              <Icon className="size-5" />
            </span>
            <div className="flex min-w-0 flex-col gap-1.5 pt-1">
              <AlertDialog.Title className="text-base font-semibold tracking-tight">
                {title}
              </AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-muted-foreground">
                {description}
              </AlertDialog.Description>
            </div>
          </div>
          <div className="flex justify-end">
            <Button autoFocus className="w-full sm:w-auto" onClick={onAction}>
              {actionLabel}
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
