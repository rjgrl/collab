import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { FormField, PageHeader, PrimaryButton } from "@/components/page-header";
import { can, useSession } from "@/lib/session";
import { client, orpc, queryClient } from "@/utils/orpc";

export const Route = createFileRoute("/_app/alumni/new")({
  component: NewAlumniPage,
});

function NewAlumniPage() {
  const navigate = useNavigate();
  const session = useSession();
  const programs = useQuery(orpc.programs.list.queryOptions({ input: {} }));
  const [form, setForm] = useState({
    studentNumber: "",
    firstName: "",
    lastName: "",
    middleName: "",
    gender: "",
    graduationYear: "",
    batch: "",
    mobileNumber: "",
    personalEmail: "",
    facebookAccount: "",
    programId: "",
  });

  const save = useMutation({
    mutationFn: () =>
      client.alumni.create({
        ...form,
        graduationYear: form.graduationYear ? Number(form.graduationYear) : undefined,
        programId: form.programId,
      }),
    onSuccess: async (alumni) => {
      toast.success("Alumni record created");
      await queryClient.invalidateQueries();
      await navigate({ to: "/alumni/$id", params: { id: alumni.id } });
    },
    onError: (error) => toast.error(error.message),
  });

  if (!can(session.data?.permissions, "alumni.write")) {
    return <p>You do not have permission to create alumni records.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="New alumni profile" description="Attach the graduate to a program." />
      <Card>
        <CardHeader>
          <CardTitle>Student details and contact info</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate();
            }}
          >
            <FormField id="programId" label="Program">
              <select
                id="programId"
                className="h-8 border border-input bg-transparent px-2 text-xs"
                value={form.programId}
                onChange={(event) => setForm({ ...form, programId: event.target.value })}
                required
              >
                <option value="">Select program</option>
                {programs.data?.map((program) => (
                  <option key={program.id} value={program.id}>
                    {program.department.code} / {program.code} — {program.name}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="studentNumber" label="Student number">
              <Input
                id="studentNumber"
                value={form.studentNumber}
                onChange={(event) => setForm({ ...form, studentNumber: event.target.value })}
                required
              />
            </FormField>
            <FormField id="firstName" label="First name">
              <Input
                id="firstName"
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                required
              />
            </FormField>
            <FormField id="lastName" label="Last name">
              <Input
                id="lastName"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                required
              />
            </FormField>
            <FormField id="middleName" label="Middle name">
              <Input
                id="middleName"
                value={form.middleName}
                onChange={(event) => setForm({ ...form, middleName: event.target.value })}
              />
            </FormField>
            <FormField id="gender" label="Gender">
              <Input
                id="gender"
                value={form.gender}
                onChange={(event) => setForm({ ...form, gender: event.target.value })}
              />
            </FormField>
            <FormField id="graduationYear" label="Graduation year">
              <Input
                id="graduationYear"
                type="number"
                value={form.graduationYear}
                onChange={(event) => setForm({ ...form, graduationYear: event.target.value })}
              />
            </FormField>
            <FormField id="batch" label="Batch">
              <Input
                id="batch"
                value={form.batch}
                onChange={(event) => setForm({ ...form, batch: event.target.value })}
              />
            </FormField>
            <FormField id="mobileNumber" label="Mobile #">
              <Input
                id="mobileNumber"
                value={form.mobileNumber}
                onChange={(event) => setForm({ ...form, mobileNumber: event.target.value })}
              />
            </FormField>
            <FormField id="personalEmail" label="Personal email">
              <Input
                id="personalEmail"
                type="email"
                value={form.personalEmail}
                onChange={(event) => setForm({ ...form, personalEmail: event.target.value })}
              />
            </FormField>
            <FormField id="facebookAccount" label="Facebook account">
              <Input
                id="facebookAccount"
                value={form.facebookAccount}
                onChange={(event) => setForm({ ...form, facebookAccount: event.target.value })}
              />
            </FormField>
            <div className="flex gap-2 md:col-span-2">
              <PrimaryButton type="submit" pending={save.isPending}>
                Create profile
              </PrimaryButton>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
