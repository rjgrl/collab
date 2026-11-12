/**
 * Turns a stored audit entry about one alumnus into plain-language text for the Change history
 * table. Pure: callers resolve record IDs (program, assigned faculty) to names beforehand.
 */
import { auditActionLabel, auditFieldLabel } from "./audit-labels";

export type HistoryChange = { field: string; old: unknown; new: unknown };
export type TrackingDetails = { isTracked?: boolean; source?: string; notes?: string };

const FIELD_LABELS: Record<string, string> = {
  isTracked: "Tracking status",
  isCurrent: "Current job",
  status: "Employment status",
  jobTitle: "Position",
};
// Derived or internal fields that add nothing for a reader.
const HIDDEN_FIELDS = new Set(["status", "employmentRevision", "updatedAt", "createdAt"]);
const ACTION_TITLES: Record<string, string> = {
  "employment.create": "Added employment",
  "employment.self.create": "Added employment",
  "employment.update": "Updated employment",
  "employment.self.update": "Updated employment",
  "employment.delete": "Removed employment",
  "employment.self.delete": "Removed employment",
  "alumni.update": "Updated student details",
  "contacts.create": "Added contact",
  "contacts.update": "Updated contact",
  "contacts.delete": "Removed contact",
};
const SOURCES: Record<string, string> = {
  manual: "Manual",
  google_forms: "Google Forms",
  import: "Import",
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function isEmpty(value: unknown) {
  return value === null || value === undefined || value === "";
}

export function formatHistoryValue(field: string, value: unknown): string {
  if (isEmpty(value)) return "empty";
  if (field === "isTracked") return value ? "Tracked" : "Untracked";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (value instanceof Date) value = value.toISOString();
  if (typeof value === "string") {
    const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
    if (iso) {
      // Dates are stored as UTC midnight; show the calendar day, and the time only when set.
      const day = `${MONTHS[Number(iso[2]) - 1]} ${Number(iso[3])}, ${iso[1]}`;
      return iso[4] === "00" && iso[5] === "00" ? day : `${day}, ${iso[4]}:${iso[5]} UTC`;
    }
    // Never show raw database IDs.
    if (/^[a-f\d]{24}$/i.test(value)) return "a linked record";
    if (field === "status" || field === "employmentStatus")
      return value.charAt(0).toUpperCase() + value.slice(1);
    return value;
  }
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item) => formatHistoryValue(field, item)).join(", ");
  return "updated";
}

function fieldLabel(entity: string, field: string) {
  return FIELD_LABELS[field] ?? auditFieldLabel(entity, field);
}

/** Old summaries embedded raw IDs and JSON quoting; keep the words, drop the machinery. */
function cleanSummary(summary: string) {
  return summary
    .replace(/\s*(?:for|from|to|of)?\s*Alumni(?: profile)? [a-f\d]{24}/gi, "")
    .replace(/,? ?employment [a-f\d]{24}/gi, "")
    .replace(/\b[a-f\d]{24}\b/gi, "a linked record")
    .replace(/"([^"]*)"/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Legacy tracking summaries: `...; source "manual"; notes "text"`. */
function legacyTracking(summary: string): TrackingDetails {
  const parsed = /; source "((?:[^"\\]|\\.)*)"; notes "((?:[^"\\]|\\.)*)"$/.exec(summary);
  if (!parsed) return {};
  const unquote = (text: string) => {
    try {
      return JSON.parse(`"${text}"`) as string;
    } catch {
      return text;
    }
  };
  return { source: unquote(parsed[1]!), notes: unquote(parsed[2]!) };
}

export function describeHistoryEntry(entry: {
  action: string;
  entity: string;
  summary: string;
  changes: HistoryChange[];
  tracking?: TrackingDetails | null;
}): { title: string; details: string[] } {
  const changes = entry.changes.filter((change) => !HIDDEN_FIELDS.has(change.field));

  if (entry.action === "tracking.create") {
    const tracking = { ...legacyTracking(entry.summary), ...entry.tracking };
    const statusChange = entry.changes.find((change) => change.field === "isTracked");
    const isTracked = tracking.isTracked ?? (statusChange ? Boolean(statusChange.new) : undefined);
    const details: string[] = [];
    if (statusChange && !isEmpty(statusChange.old))
      details.push(`Was ${formatHistoryValue("isTracked", statusChange.old)}`);
    else if (!statusChange && tracking.isTracked === undefined) details.push("Status unchanged");
    if (tracking.notes?.trim()) details.push(`Notes: ${tracking.notes.trim()}`);
    if (tracking.source && tracking.source !== "manual")
      details.push(`Source: ${SOURCES[tracking.source] ?? tracking.source}`);
    return {
      title:
        isTracked === undefined
          ? "Recorded tracking"
          : isTracked
            ? "Marked tracked"
            : "Marked untracked",
      details,
    };
  }

  const title = ACTION_TITLES[entry.action] ?? auditActionLabel(entry.action);
  if (!changes.length) {
    const summary = cleanSummary(entry.summary);
    return {
      title,
      details: summary && summary !== "No audited fields changed." ? [summary] : [],
    };
  }
  const created = changes.every((change) => isEmpty(change.old));
  const removed = changes.every((change) => isEmpty(change.new));
  return {
    title,
    details: changes.flatMap((change) => {
      const label = fieldLabel(entry.entity, change.field);
      if (created)
        return isEmpty(change.new)
          ? []
          : [`${label}: ${formatHistoryValue(change.field, change.new)}`];
      if (removed)
        return isEmpty(change.old)
          ? []
          : [`${label}: ${formatHistoryValue(change.field, change.old)}`];
      return [
        `${label}: ${formatHistoryValue(change.field, change.old)} → ${formatHistoryValue(change.field, change.new)}`,
      ];
    }),
  };
}
