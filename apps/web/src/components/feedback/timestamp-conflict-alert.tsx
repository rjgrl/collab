import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { TriangleAlert } from "lucide-react";
import { useConfirm } from "@/components/feedback/confirm-provider";

/** Shown inside an editor after timestamp ordering rejected its save; the draft is kept. */
export function TimestampConflictAlert({ onReload }: { onReload: () => void | Promise<void> }) {
  const confirm = useConfirm();
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-500/40 bg-amber-50 px-4 py-3 text-sm text-amber-950 dark:bg-amber-950/30 dark:text-amber-100"
    >
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="font-semibold">This Edit Could Not Be Saved</p>
          <p>
            A newer transaction has priority for this alumnus, or this edit expired. Your entries
            are still here and nothing from this save was applied.
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              if (
                await confirm({
                  title: "Discard Your Unsaved Entries?",
                  description:
                    "Reloading replaces this form with the latest saved data. Review it before saving again.",
                  confirmLabel: "Reload Latest",
                })
              )
                await onReload();
            }}
          >
            Reload Latest
          </Button>
        </div>
      </div>
    </div>
  );
}
