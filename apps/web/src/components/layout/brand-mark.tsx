import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white",
        className,
      )}
    >
      <img
        src="/brand/buksu-cot-seal.webp"
        alt=""
        width={384}
        height={384}
        className="size-full rounded-full object-contain"
      />
    </span>
  );
}
