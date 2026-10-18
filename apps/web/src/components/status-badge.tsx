import { Badge } from "@Alumni-Tracking-Ss/ui/components/badge";

const TONES = {
  tracked: { variant: "default" as const, label: "Tracked" },
  untracked: { variant: "outline" as const, label: "Untracked" },
  active: { variant: "secondary" as const, label: "Active" },
  disabled: { variant: "outline" as const, label: "Disabled" },
  live: { variant: "default" as const, label: "Live" },
  fallback: { variant: "secondary" as const, label: "Fallback" },
} as const;

export function StatusBadge({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children?: string;
}) {
  const preset = TONES[tone];
  return <Badge variant={preset.variant}>{children ?? preset.label}</Badge>;
}
