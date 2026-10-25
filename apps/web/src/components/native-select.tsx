import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import type { ComponentProps } from "react";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-base sm:text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
