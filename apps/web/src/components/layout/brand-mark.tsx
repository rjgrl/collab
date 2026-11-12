import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-white p-0.5 ring-1 ring-sidebar-border",
        className,
      )}
    >
      <img
        src="/brand/buksu-cot-seal.webp"
        alt="Bukidnon State University College of Technologies seal"
        width={420}
        height={420}
        className="size-full object-contain"
      />
    </span>
  );
}
