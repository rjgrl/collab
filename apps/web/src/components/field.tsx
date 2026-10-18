import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import type { ComponentProps } from "react";

export function Field({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5", className)} {...props} />;
}

export function FieldGroup({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-4", className)} {...props} />;
}
