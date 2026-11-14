"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect } from "react";
import { Toaster as Sonner, toast, useSonner, type ToasterProps } from "sonner";

/**
 * Keeps at most `max` toasts and never two with the same message: the older one is dismissed
 * (it fades out) as soon as a newer one appears. Sonner itself only hides extras until there is
 * room again, which brought old toasts back.
 */
function ToastLimit({ max }: { max: number }) {
  const { toasts } = useSonner();
  useEffect(() => {
    const seen = new Set<string>();
    let kept = 0;
    // Newest first.
    for (const item of toasts) {
      const key = `${item.type ?? "default"}:${typeof item.title === "string" ? item.title : item.id}`;
      if (seen.has(key) || kept >= max) toast.dismiss(item.id);
      else {
        seen.add(key);
        kept++;
      }
    }
  }, [toasts, max]);
  return null;
}

const Toaster = ({ visibleToasts = 3, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <>
      <ToastLimit max={visibleToasts} />
      <Sonner
        // Listed one above another instead of an overlapping stack.
        expand
        visibleToasts={visibleToasts}
        theme={theme as ToasterProps["theme"]}
        className="toaster group"
        icons={{
          success: <CircleCheckIcon className="size-4" />,
          info: <InfoIcon className="size-4" />,
          warning: <TriangleAlertIcon className="size-4" />,
          error: <OctagonXIcon className="size-4" />,
          loading: <Loader2Icon className="size-4 animate-spin" />,
        }}
        style={
          {
            "--normal-bg": "var(--popover)",
            "--normal-text": "var(--popover-foreground)",
            "--normal-border": "var(--border)",
            "--success-text": "var(--toast-success-text)",
            "--border-radius": "var(--radius)",
          } as React.CSSProperties
        }
        {...props}
      />
    </>
  );
};

export { Toaster };
