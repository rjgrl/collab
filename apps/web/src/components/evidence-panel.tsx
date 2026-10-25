import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { evidenceOutputSchema, employmentOutputSchema } from "@Alumni-Tracking-Ss/contracts/alumni";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import { toast } from "sonner";
import { client, queryClient, uploadProfileFile } from "@/utils/api";
import { ENV } from "../env";
import { FormCard, FormField, PrimaryButton } from "./page-header";
import { NativeSelect } from "./native-select";
import { FileCheck2, ImagePlus } from "lucide-react";

export function EvidencePanel({
  files,
  jobs,
  alumniId,
  photoUrl,
  kind: fixedKind,
  canUpload = true,
  canDelete = true,
}: {
  files: z.infer<typeof evidenceOutputSchema>[];
  jobs: z.infer<typeof employmentOutputSchema>[];
  alumniId?: string;
  photoUrl?: string | null;
  kind?: "image" | "evidence";
  canUpload?: boolean;
  canDelete?: boolean;
}) {
  const fieldId = useId();
  const [file, setFile] = useState<File>();
  const [selectedKind, setKind] = useState<"image" | "evidence">("evidence");
  const kind = fixedKind ?? selectedKind;
  const visibleFiles = fixedKind ? files.filter((item) => item.kind === fixedKind) : files;
  const [employmentId, setEmploymentId] = useState("");
  const [progress, setProgress] = useState(0);
  const [inputKey, setInputKey] = useState(0);
  const root = `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/api/${alumniId ? "" : "me/"}files`;
  const photoId = photoUrl?.match(/^\/api\/(?:me\/)?files\/([a-f0-9]{24})$/i)?.[1];
  const photoSource = photoId ? `${root}/${photoId}?preview=1` : photoUrl;
  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose a file before uploading.");
      setProgress(0);
      return uploadProfileFile({
        file,
        kind,
        alumniId,
        employmentId: kind === "evidence" && employmentId ? employmentId : undefined,
        onProgress: setProgress,
      });
    },
    onSuccess: async () => {
      setFile(undefined);
      setInputKey((value) => value + 1);
      toast.success("File uploaded");
      await queryClient.invalidateQueries();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      alumniId ? client.files.remove({ id }) : client.me.removeFile({ id }),
    onSuccess: async () => {
      toast.success("File removed");
      await queryClient.invalidateQueries();
    },
  });
  return (
    <FormCard
      title={
        fixedKind === "image"
          ? "Profile photo"
          : fixedKind === "evidence"
            ? "Supporting evidence"
            : "Photo and evidence"
      }
      description={
        fixedKind === "image"
          ? "Profile photo associated with this Alumni record. Supporting documents are listed separately."
          : fixedKind === "evidence"
            ? "Share documents for Staff review. Uploading evidence does not automatically mark you as tracked."
            : "Keep your profile photo separate from confidential employment evidence. Files remain protected by account access."
      }
    >
      {photoUrl && fixedKind !== "evidence" ? (
        <img
          className="mb-4 size-24 rounded-md border object-cover"
          src={photoSource ?? undefined}
          alt="Alumni profile"
        />
      ) : null}
      {visibleFiles.length ? (
        <ul className="mb-5 divide-y">
          {visibleFiles.map((item) => (
            <li
              id={`evidence-${item.id}`}
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 py-3"
            >
              <div className="min-w-0">
                <p className="break-all text-sm font-medium">{item.originalName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.kind === "image" ? "Profile photo" : "Private evidence"} ·{" "}
                  {(item.sizeBytes / 1024).toFixed(1)} KB
                  {item.employmentId
                    ? ` · ${jobs.find((j) => j.id === item.employmentId)?.employer ?? "Previous employment"}`
                    : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-3 text-sm">
                <a
                  className="underline underline-offset-4"
                  target="_blank"
                  rel="noopener noreferrer"
                  href={`${root}/${item.id}?preview=1`}
                >
                  Preview<span className="sr-only"> {item.originalName}</span>
                </a>
                <a className="underline underline-offset-4" href={`${root}/${item.id}`}>
                  Download<span className="sr-only"> {item.originalName}</span>
                </a>
                {canDelete ? (
                  <button
                    className="underline underline-offset-4"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${item.originalName}? It will no longer be available for normal viewing.`,
                        )
                      )
                        remove.mutate(item.id);
                    }}
                  >
                    Remove<span className="sr-only"> {item.originalName}</span>
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : photoUrl && fixedKind === "image" ? null : (
        <div className="mb-5 flex items-start gap-3 rounded-lg border border-dashed bg-muted/20 p-4">
          {fixedKind === "image" ? (
            <ImagePlus
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            />
          ) : (
            <FileCheck2
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            />
          )}
          <div>
            <p className="text-sm font-medium">
              {fixedKind === "image"
                ? "No profile photo uploaded"
                : fixedKind === "evidence"
                  ? "No evidence uploaded yet"
                  : "No photo or evidence uploaded."}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {fixedKind === "image"
                ? "Choose a JPEG, PNG or WebP image below."
                : "Add employment documents to support your university record."}
            </p>
          </div>
        </div>
      )}
      {canUpload ? (
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            upload.mutate();
          }}
        >
          {!fixedKind ? (
            <FormField id={`${fieldId}-kind`} label="File purpose">
              <NativeSelect
                id={`${fieldId}-kind`}
                value={kind}
                onChange={(e) => {
                  if (e.target.value === "image" || e.target.value === "evidence")
                    setKind(e.target.value);
                }}
              >
                <option value="evidence">Private employment evidence</option>
                <option value="image">Profile photo</option>
              </NativeSelect>
            </FormField>
          ) : null}
          {kind === "evidence" ? (
            <div className={fixedKind ? "sm:col-span-2" : undefined}>
              <FormField id={`${fieldId}-employment`} label="Related employment (optional)">
                <NativeSelect
                  id={`${fieldId}-employment`}
                  value={employmentId}
                  onChange={(e) => setEmploymentId(e.target.value)}
                >
                  <option value="">General profile evidence</option>
                  {jobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.employer}
                    </option>
                  ))}
                </NativeSelect>
              </FormField>
            </div>
          ) : null}
          <div className="sm:col-span-2">
            <FormField
              id={`${fieldId}-file`}
              label={kind === "image" ? "Choose profile photo" : "Choose evidence file"}
              required
            >
              <Input
                key={inputKey}
                id={`${fieldId}-file`}
                type="file"
                accept={
                  kind === "image"
                    ? "image/jpeg,image/png,image/webp"
                    : "image/jpeg,image/png,image/webp,application/pdf"
                }
                required
                onChange={(e) => setFile(e.target.files?.[0])}
              />
            </FormField>
            <p className="mt-2 text-xs text-muted-foreground">
              {kind === "image" ? "JPEG, PNG or WebP image." : "JPEG, PNG, WebP or PDF evidence."}{" "}
              Maximum 10 MB. File contents are checked by the server.
            </p>
          </div>
          {upload.isPending ? (
            <div className="sm:col-span-2">
              <label htmlFor={`${fieldId}-progress`} className="text-sm">
                Uploading {progress}%{progress === 100 ? " — saving file…" : ""}
              </label>
              <progress
                id={`${fieldId}-progress`}
                className="mt-2 h-2 w-full"
                value={progress}
                max={100}
              />
            </div>
          ) : null}
          {upload.error ? (
            <p role="alert" className="text-sm text-destructive sm:col-span-2">
              {upload.error.message}
            </p>
          ) : null}
          {upload.isSuccess ? (
            <p role="status" className="text-sm sm:col-span-2">
              Upload complete.
            </p>
          ) : null}
          <div className="sm:col-span-2">
            <PrimaryButton type="submit" pending={upload.isPending} pendingLabel="Uploading">
              {fixedKind === "image" ? "Upload photo" : "Upload file"}
            </PrimaryButton>
          </div>
        </form>
      ) : null}
      {remove.error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {remove.error.message}
        </p>
      ) : null}
      {!canUpload && !visibleFiles.length ? (
        <Button variant="ghost" disabled>
          Uploads require file permission
        </Button>
      ) : null}
    </FormCard>
  );
}
