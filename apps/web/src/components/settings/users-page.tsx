import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "@/components/checkbox-row";
import { DataTable, QuietButton, RowActions, TableCell, TableRow } from "@/components/data-table";
import {
  FieldsetLabel,
  FormField,
  PageHeader,
  PageShell,
  PrimaryButton,
} from "@/components/page-header";
import { StatusBadge } from "@/components/status-badge";
import { TablePagination } from "@/components/table-pagination";
import { can, useSession } from "@/lib/session";
import { client, api, queryClient } from "@/utils/api";
import { NameFields, emptyName } from "@/components/name-fields";
import {
  formatDisplayName,
  isAdministrator,
  isAlumniAccount,
} from "@Alumni-Tracking-Ss/contracts/names";
import { NativeSelect } from "@/components/native-select";
import { AccountProfileFields } from "@/components/account-profile-fields";
import { AcademicProfileFields, emptyAcademic } from "@/components/academic-profile-fields";
import { usersSchemas } from "@Alumni-Tracking-Ss/contracts/users";

export function UsersPage() {
  const session = useSession();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const users = useQuery(api.users.list.queryOptions({ input: { search, page, pageSize: 20 } }));
  const roles = useQuery(api.roles.list.queryOptions());
  const canWrite = can(session.data?.permissions, "users.write");
  const canLink = Boolean(
    session.data &&
    isAdministrator(session.data) &&
    canWrite &&
    can(session.data.permissions, "alumni.write"),
  );
  const [linkTarget, setLinkTarget] = useState<{ id: string; name: string } | null>(null);
  const [alumniSearch, setAlumniSearch] = useState("");
  const [alumniId, setAlumniId] = useState("");
  const candidates = useQuery({
    ...api.alumni.list.queryOptions({ input: { search: alumniSearch, pageSize: 100 } }),
    enabled: canLink && linkTarget !== null,
  });
  const link = useMutation({
    mutationFn: () => {
      if (!linkTarget) throw new Error("Choose an account.");
      return client.users.linkAlumni({ id: linkTarget.id, alumniId });
    },
    onSuccess: async () => {
      setLinkTarget(null);
      setAlumniId("");
      await queryClient.invalidateQueries();
      toast.success("Alumni account linked");
    },
  });
  const [draft, setDraft] = useState({
    ...emptyName,
    email: "",
    password: "",
    roleIds: [] as string[],
  });
  const [profile, setProfile] = useState({ phoneNumber: "", gender: "", facebookAccount: "" });
  const [academic, setAcademic] = useState(emptyAcademic);
  const alumniAccount = isAlumniAccount({
    roles:
      roles.data?.filter((role) => draft.roleIds.includes(role.id)).map((role) => role.key) ?? [],
  });

  const create = useMutation({
    mutationFn: () =>
      client.users.create(
        usersSchemas.create.input.parse({
          ...draft,
          ...(alumniAccount
            ? {
                alumniProfile: {
                  ...profile,
                  ...academic,
                  graduationYear: academic.graduationYear
                    ? Number(academic.graduationYear)
                    : undefined,
                },
              }
            : {}),
        }),
      ),
    onSuccess: async () => {
      toast.success("User created");
      setOpen(false);
      setDraft({ ...emptyName, email: "", password: "", roleIds: [] });
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  const toggleStatus = useMutation({
    mutationFn: (input: { id: string; status: "active" | "disabled" }) =>
      client.users.setStatus(input),
    onSuccess: async () => {
      toast.success("User updated");
      await queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(error.message),
  });

  return (
    <PageShell>
      <PageHeader
        title="Members"
        description="Manage accounts and their roles."
        actions={
          canWrite ? (
            <PrimaryButton
              disabled={roles.isPending || roles.isError}
              onClick={() => {
                create.reset();
                setDraft({
                  ...emptyName,
                  email: "",
                  password: "",
                  roleIds:
                    roles.data?.filter((role) => role.key === "viewer").map((role) => role.id) ??
                    [],
                });
                setProfile({ phoneNumber: "", gender: "", facebookAccount: "" });
                setAcademic(emptyAcademic);
                setOpen(true);
              }}
            >
              Add user
            </PrimaryButton>
          ) : null
        }
      />
      {canLink && linkTarget ? (
        <FormDialog
          open
          onOpenChange={(value) => {
            if (!value) setLinkTarget(null);
          }}
          pending={link.isPending}
          title="Link alumni account"
          description={`Confirm which existing alumni record belongs to ${linkTarget.name}.`}
          footer={
            <PrimaryButton
              form="link-alumni"
              type="submit"
              pending={link.isPending}
              disabled={!alumniId}
            >
              Confirm account link
            </PrimaryButton>
          }
        >
          <form
            id="link-alumni"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              link.mutate();
            }}
          >
            <p className="text-sm text-muted-foreground">
              Verify the person's identity and student number before linking. Matching names or
              email addresses alone do not establish ownership.
            </p>
            <FormField id="link-search" label="Find alumni">
              <Input
                id="link-search"
                value={alumniSearch}
                onChange={(event) => {
                  setAlumniSearch(event.target.value);
                  setAlumniId("");
                }}
              />
            </FormField>
            <FormField id="link-record" label="Alumni record" required>
              <NativeSelect
                id="link-record"
                required
                value={alumniId}
                onChange={(event) => setAlumniId(event.target.value)}
              >
                <option value="">Select a verified record</option>
                {candidates.data?.map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.studentNumber} · {formatDisplayName(record)}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {candidates.error || link.error ? (
              <p role="alert">{candidates.error?.message ?? link.error?.message}</p>
            ) : null}
          </form>
        </FormDialog>
      ) : null}
      {canWrite && open ? (
        <FormDialog
          open
          onOpenChange={setOpen}
          pending={create.isPending}
          footer={
            <>
              <PrimaryButton
                type="submit"
                form="create-user"
                pending={create.isPending}
                disabled={!draft.roleIds.length || !roles.data}
                pendingLabel="Creating"
              >
                Create user
              </PrimaryButton>
            </>
          }
          title="Add user"
          description="New accounts default to Alumni. Alumni accounts and their registry profiles are created together."
        >
          <form
            id="create-user"
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              create.mutate();
            }}
          >
            <NameFields
              value={draft}
              prefix="member"
              onChange={(names) => setDraft({ ...draft, ...names })}
            />
            <FormField id="email" label="Email" required>
              <Input
                id="email"
                type="email"
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                required
              />
            </FormField>
            <FormField id="password" label="Password" required>
              <Input
                id="password"
                type="password"
                value={draft.password}
                onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                required
                minLength={15}
                maxLength={256}
                autoComplete="new-password"
                aria-describedby="member-password-guidance"
              />
            </FormField>
            <p id="member-password-guidance" className="text-xs text-muted-foreground">
              Use 15–128 characters. Spaces and Unicode are welcome. Choose a unique passphrase.
            </p>
            {alumniAccount ? (
              <>
                <AccountProfileFields value={profile} onChange={setProfile} />
                <AcademicProfileFields value={academic} onChange={setAcademic} />
              </>
            ) : null}
            <div className="flex flex-col gap-2">
              <FieldsetLabel>Roles</FieldsetLabel>
              {roles.data?.map((role) => (
                <CheckboxRow
                  key={role.id}
                  checked={draft.roleIds.includes(role.id)}
                  onCheckedChange={(checked) =>
                    setDraft({
                      ...draft,
                      roleIds: checked
                        ? [...draft.roleIds, role.id]
                        : draft.roleIds.filter((id) => id !== role.id),
                    })
                  }
                >
                  {role.name}
                </CheckboxRow>
              ))}
            </div>
          </form>
        </FormDialog>
      ) : null}
      <DataTable
        headers={["Name", "Email", "Roles", "Status", "Actions"]}
        search={search}
        onSearch={(value) => {
          setSearch(value);
          setPage(1);
        }}
        searchPlaceholder="Search users"
        loading={users.isPending}
        isEmpty={users.data?.length === 0}
        emptyTitle="No users found"
        emptyDescription="Create a user and assign at least one role."
      >
        {users.data?.map((user) => (
          <TableRow key={user.id}>
            <TableCell>{user.name}</TableCell>
            <TableCell>{user.email}</TableCell>
            <TableCell>
              {user.userRoles.map((item) => item.role.name).join(", ") || "None"}
            </TableCell>
            <TableCell>
              <StatusBadge tone={user.status === "active" ? "active" : "disabled"} />
            </TableCell>
            <TableCell>
              {canLink || can(session.data?.permissions, "users.delete") ? (
                <RowActions>
                  {canLink && !user.alumniId ? (
                    <QuietButton
                      onClick={() => {
                        link.reset();
                        setAlumniId("");
                        setAlumniSearch("");
                        setLinkTarget({ id: user.id, name: user.name });
                      }}
                    >
                      Link alumni profile
                    </QuietButton>
                  ) : null}
                  {user.alumniId ? (
                    <span className="text-xs text-muted-foreground">Alumni linked</span>
                  ) : null}
                  {can(session.data?.permissions, "users.delete") ? (
                    <QuietButton
                      onClick={() =>
                        toggleStatus.mutate({
                          id: user.id,
                          status: user.status === "active" ? "disabled" : "active",
                        })
                      }
                    >
                      {user.status === "active" ? "Disable" : "Enable"}
                    </QuietButton>
                  ) : null}
                </RowActions>
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </DataTable>
      <TablePagination
        page={page}
        onPage={setPage}
        hasNext={users.data?.length === 20}
        pending={users.isFetching}
      />
    </PageShell>
  );
}
