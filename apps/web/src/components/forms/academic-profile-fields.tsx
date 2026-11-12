import { useQuery } from "@tanstack/react-query";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { api } from "@/lib/api";
import { collectOptionPages } from "@/lib/pagination";
import { FormField, NumberedLegend } from "@/components/forms/form-layout";
import { FormSelect } from "@/components/forms/form-select";

export const emptyAcademic = { studentNumber: "", programId: "", graduationYear: "" };
export function AcademicProfileFields({
  value,
  onChange,
  compact = false,
}: {
  value: typeof emptyAcademic;
  onChange: (value: typeof emptyAcademic) => void;
  /**
   * Sign-up layout: numbered "Your studies" group (step 3), program on its own row, no
   * explanatory note (the review rule is explained after registration).
   */
  compact?: boolean;
}) {
  const programs = useQuery({
    queryKey: ["rest", "registration-program-options"],
    queryFn: ({ signal }) =>
      collectOptionPages((page) =>
        api.auth.registrationPrograms
          .queryOptions({ input: { page, pageSize: 100 } })
          .queryFn({ signal }),
      ),
  });
  const program = (
    <div className={compact ? "sm:col-span-2" : undefined}>
      <FormField id="registration-program" label="Degree program" required>
        <FormSelect
          id="registration-program"
          value={value.programId}
          disabled={programs.isPending || programs.isError}
          required
          onValueChange={(selected) => onChange({ ...value, programId: selected })}

          items={[
            {
              value: "",
              label: programs.isPending ? "Loading programs…" : "Select degree program",
            },
            ...(programs.data?.map((p) => ({
              value: p.id,
              label: `${p.department.name} / ${p.code} — ${p.name}`,
            })) ?? []),
          ]}
        />
      </FormField>
    </div>
  );
  return (
    <fieldset
      className={compact ? "grid content-start gap-3 sm:grid-cols-2" : "grid gap-4 sm:col-span-2"}
    >
      {compact ? (
        <NumberedLegend step={3}>Your studies</NumberedLegend>
      ) : (
        <legend className="mb-3 text-sm font-medium">Academic information</legend>
      )}
      {compact ? program : null}
      <FormField id="registration-student" label="Student number" required>
        <Input
          id="registration-student"
          value={value.studentNumber}
          maxLength={40}
          required
          onChange={(e) => onChange({ ...value, studentNumber: e.target.value })}
        />
      </FormField>
      {compact ? null : program}
      <FormField id="registration-year" label="Graduation year" required>
        <Input
          id="registration-year"
          type="number"
          min={1950}
          max={2100}
          required
          value={value.graduationYear}
          onChange={(e) => onChange({ ...value, graduationYear: e.target.value })}
        />
      </FormField>
      {programs.isError ? (
        <p role="alert" className={compact ? "text-sm sm:col-span-full" : "text-sm"}>
          Could not load programs.{" "}
          <button type="button" className="underline" onClick={() => void programs.refetch()}>
            Retry
          </button>
        </p>
      ) : programs.data?.length === 0 ? (
        <p
          className={
            compact
              ? "text-sm text-muted-foreground sm:col-span-full"
              : "text-sm text-muted-foreground"
          }
        >
          Registration needs an active degree program. Ask the university administrator to configure
          one.
        </p>
      ) : null}
      {compact ? null : (
        <p className="text-xs text-muted-foreground">
          If your student number already has an alumni record, ask the university to review it.
          Registration never claims a record automatically.
        </p>
      )}
    </fieldset>
  );
}
