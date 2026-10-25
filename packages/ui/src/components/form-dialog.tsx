import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/** Shared modal with a fixed header/footer and an independently scrolling body. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  pending = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  pending?: boolean;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
      disablePointerDismissal
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/45" />
        <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-3xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border bg-card shadow-xl outline-none">
          <div className="relative shrink-0 border-b px-5 py-4 pr-14">
            <Dialog.Title className="text-lg font-semibold">{title}</Dialog.Title>
            {description ? (
              <Dialog.Description className="mt-1 text-sm text-muted-foreground">
                {description}
              </Dialog.Description>
            ) : null}
            <Dialog.Close
              disabled={pending}
              aria-label="Close dialog"
              className="absolute top-2 right-2 flex size-11 items-center justify-center rounded-lg border border-destructive/20 bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:outline-2 focus-visible:outline-destructive disabled:opacity-50"
            >
              <X className="size-4" />
            </Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto overscroll-contain p-5" data-dialog-body>
            {children}
          </div>
          {footer ? (
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t bg-muted/30 px-5 py-4">
              {footer}
            </div>
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
