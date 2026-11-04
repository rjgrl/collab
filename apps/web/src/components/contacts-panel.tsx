import { Card, CardContent, CardHeader, CardTitle } from "@Alumni-Tracking-Ss/ui/components/card";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { socialUrlFromInput, type ContactType } from "@Alumni-Tracking-Ss/contracts/contacts";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { CheckboxRow } from "@/components/checkbox-row";
import { QuietButton } from "@/components/data-table";
import { FormSelect } from "@/components/form-select";
import { FormField, PrimaryButton } from "@/components/page-header";
import { client, queryClient } from "@/utils/api";

type Contact = {
  id: string;
  type: ContactType;
  value: string;
  label: string;
  isPrimary: boolean;
};
type Kind = "phone" | "email" | "social";
type SocialType = Exclude<ContactType, "phone" | "email">;
type Draft = {
  id?: string;
  kind: Kind;
  type: ContactType;
  value: string;
  label: string;
  isPrimary: boolean;
};

const TYPE_LABELS: Record<ContactType, string> = {
  phone: "Phone",
  email: "Email",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  instagram: "Instagram",
  x: "X",
  other_social: "Other social",
};
const SOCIAL: SocialType[] = ["facebook", "linkedin", "instagram", "x", "other_social"];
const kindOf = (type: ContactType): Kind =>
  type === "phone" ? "phone" : type === "email" ? "email" : "social";

export function ContactsPanel({
  alumniId,
  contacts,
  canWrite,
}: {
  alumniId: string;
  contacts: Contact[];
  canWrite: boolean;
}) {
  // null: closed. "choose": step 1 (pick a kind). Draft: step 2 (fields).
  const [dialog, setDialog] = useState<null | "choose" | Draft>(null);

  const done = async (message: string) => {
    toast.success(message);
    setDialog(null);
    await queryClient.invalidateQueries();
  };
  const save = useMutation({
    mutationFn: (draft: Draft) => {
      const value =
        draft.kind === "social"
          ? socialUrlFromInput(draft.type as SocialType, draft.value)
          : draft.value;
      return draft.id
        ? client.alumni.updateContact({
            alumniId,
            id: draft.id,
            value,
            label: draft.label,
            isPrimary: draft.isPrimary,
          })
        : client.alumni.addContact({
            alumniId,
            type: draft.type,
            value,
            label: draft.label,
            isPrimary: draft.isPrimary,
          } as Parameters<typeof client.alumni.addContact>[0]);
    },
    onSuccess: (_result, draft) => done(draft.id ? "Contact updated" : "Contact added"),
    onError: (error) => toast.error(error.message),
  });
  const makePrimary = useMutation({
    mutationFn: (contact: Contact) =>
      client.alumni.updateContact({ alumniId, id: contact.id, isPrimary: true }),
    onSuccess: () => done("Primary contact updated"),
    onError: (error) => toast.error(error.message),
  });
  const remove = useMutation({
    mutationFn: (contact: Contact) => client.alumni.deleteContact({ alumniId, id: contact.id }),
    onSuccess: () => done("Contact removed"),
    onError: (error) => toast.error(error.message),
  });

  const start = (kind: Kind) =>
    setDialog({
      kind,
      type: kind === "phone" ? "phone" : kind === "email" ? "email" : "facebook",
      value: "",
      label: "",
      isPrimary: false,
    });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle>Contacts</CardTitle>
        {canWrite ? (
          <PrimaryButton onClick={() => setDialog("choose")}>Add contact</PrimaryButton>
        ) : null}
      </CardHeader>
      <CardContent>
        {contacts.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No contacts yet.
          </p>
        ) : (
          <ul className="divide-y text-sm">
            {contacts.map((contact) => (
              <li
                key={contact.id}
                className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {TYPE_LABELS[contact.type]}
                    {contact.label ? (
                      <span className="font-normal text-muted-foreground"> · {contact.label}</span>
                    ) : null}
                    {contact.isPrimary ? (
                      <span className="ml-2 rounded-md bg-muted px-2 py-0.5 text-xs">Primary</span>
                    ) : null}
                  </p>
                  {kindOf(contact.type) === "social" ? (
                    <a
                      href={contact.value}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      className="break-all text-muted-foreground underline underline-offset-2"
                    >
                      {contact.value}
                    </a>
                  ) : (
                    <p className="break-all text-muted-foreground">{contact.value}</p>
                  )}
                </div>
                {canWrite ? (
                  <div className="flex flex-wrap gap-2">
                    {contact.isPrimary ? null : (
                      <QuietButton
                        disabled={makePrimary.isPending}
                        onClick={() => makePrimary.mutate(contact)}
                      >
                        Make primary
                      </QuietButton>
                    )}
                    <QuietButton
                      onClick={() => setDialog({ ...contact, kind: kindOf(contact.type) })}
                    >
                      Edit
                    </QuietButton>
                    <QuietButton
                      variant="destructive"
                      disabled={remove.isPending}
                      onClick={() => {
                        if (confirm(`Remove this ${TYPE_LABELS[contact.type]} contact?`))
                          remove.mutate(contact);
                      }}
                    >
                      Delete
                    </QuietButton>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      {dialog === "choose" ? (
        <FormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          title="Add contact"
          footer={
            <QuietButton type="button" onClick={() => setDialog(null)}>
              Cancel
            </QuietButton>
          }
        >
          <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Contact kind">
            <QuietButton onClick={() => start("phone")}>Phone number</QuietButton>
            <QuietButton onClick={() => start("email")}>Email</QuietButton>
            <QuietButton onClick={() => start("social")}>Social media</QuietButton>
          </div>
        </FormDialog>
      ) : dialog ? (
        <FormDialog
          open
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
          pending={save.isPending}
          title={
            dialog.id
              ? `Edit ${TYPE_LABELS[dialog.type]} contact`
              : dialog.kind === "phone"
                ? "Add phone number"
                : dialog.kind === "email"
                  ? "Add email"
                  : "Add social media"
          }
          footer={
            <div className="flex flex-wrap gap-2">
              <PrimaryButton type="submit" form="contact-form" pending={save.isPending}>
                Save
              </PrimaryButton>
              {dialog.id ? null : (
                <QuietButton type="button" onClick={() => setDialog("choose")}>
                  Back
                </QuietButton>
              )}
              <QuietButton type="button" onClick={() => setDialog(null)}>
                Cancel
              </QuietButton>
            </div>
          }
        >
          <form
            id="contact-form"
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              save.mutate(dialog);
            }}
          >
            {dialog.kind === "social" && !dialog.id ? (
              <FormField id="contact-platform" label="Platform" required>
                <FormSelect
                  id="contact-platform"
                  value={dialog.type}
                  onValueChange={(selected) =>
                    setDialog({ ...dialog, type: selected as ContactType })
                  }
                  required
                  items={SOCIAL.map((type) => ({ value: type, label: TYPE_LABELS[type] }))}
                />
              </FormField>
            ) : null}
            <FormField
              id="contact-value"
              label={
                dialog.kind === "phone"
                  ? "Phone number"
                  : dialog.kind === "email"
                    ? "Email address"
                    : dialog.type === "other_social"
                      ? "Profile link"
                      : "Profile link or handle"
              }
              required
            >
              <Input
                id="contact-value"
                type={dialog.kind === "phone" ? "tel" : dialog.kind === "email" ? "email" : "text"}
                inputMode={dialog.kind === "phone" ? "tel" : undefined}
                autoComplete="off"
                placeholder={
                  dialog.kind === "phone"
                    ? "0917 123 4567 or +63 917 123 4567"
                    : dialog.kind === "email"
                      ? "name@example.com"
                      : dialog.type === "other_social"
                        ? "https://…"
                        : "@handle or https://…"
                }
                value={dialog.value}
                onChange={(event) => setDialog({ ...dialog, value: event.target.value })}
                required
              />
            </FormField>
            <FormField id="contact-label" label="Label">
              <Input
                id="contact-label"
                placeholder="Work, Personal…"
                maxLength={60}
                value={dialog.label}
                onChange={(event) => setDialog({ ...dialog, label: event.target.value })}
              />
            </FormField>
            <CheckboxRow
              checked={dialog.isPrimary}
              onCheckedChange={(checked) => setDialog({ ...dialog, isPrimary: checked })}
            >
              Primary {TYPE_LABELS[dialog.type].toLowerCase()} contact
            </CheckboxRow>
          </form>
        </FormDialog>
      ) : null}
    </Card>
  );
}
