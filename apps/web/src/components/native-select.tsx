import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import type { ComponentProps } from "react";

export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "h-8 w-full min-w-0 rounded-none border border-input bg-transparent px-2.5 text-xs outline-none transition-colors focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
