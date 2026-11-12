import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { AccountAvatar } from "@/components/account/account-avatar";
import { useConfirm } from "@/components/feedback/confirm-provider";
import { ErrorAlert } from "@/components/feedback/error-alert";
import { FilePicker } from "@/components/forms/file-picker";
import { PrimaryButton } from "@/components/forms/form-layout";
import { client, queryClient, uploadProfileFile } from "@/lib/api";

export function AlumniPhotoDialog({
  alumniId,
  name,
  photoUrl,
  onClose,
}: {
  alumniId: string;
  name: string;
  photoUrl?: string | null;
  onClose: () => void;
}) {
  const id = useId();
  const confirmAction = useConfirm();
  const [file, setFile] = useState<File>();
  const [progress, setProgress] = useState(0);
  const upload = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("Choose a photo before uploading.");
      setProgress(0);
      return uploadProfileFile({ file, kind: "image", alumniId, onProgress: setProgress });
    },
    onSuccess: async () => {
      toast.success("Profile photo updated");
      await queryClient.invalidateQueries();
      onClose();
    },
  });
  const remove = useMutation({
    mutationFn: () => client.alumni.removePhoto({ alumniId }),
    onSuccess: async () => {
      toast.success("Profile photo removed");
      await queryClient.invalidateQueries();
      onClose();
    },
  });
  const pending = upload.isPending || remove.isPending;
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      pending={pending}
      title="Change profile photo"
      description={`Set, replace or remove the photo shown for ${name}.`}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          upload.mutate();
        }}
      >
        <div className="flex items-center gap-4">
          <AccountAvatar image={photoUrl} name={name} className="size-20" />
          <div className="flex min-w-0 flex-col gap-2">
            <FilePicker
              id={`${id}-photo`}
              file={file}
              accept="image/jpeg,image/png,image/webp"
              required
              disabled={pending}
              accessibleLabel="Choose profile photo"
              chooseLabel={photoUrl ? "Choose new photo" : "Choose photo"}
              describedBy={`${id}-help`}
              onChange={setFile}
            />
            <p id={`${id}-help`} className="text-xs text-muted-foreground">
              JPEG, PNG or WebP, up to 10 MB.
            </p>
          </div>
        </div>
        {upload.isPending ? (
          <p role="status" className="text-sm">
            Uploading {progress}%
          </p>
        ) : null}
        {upload.error ? <ErrorAlert>{upload.error.message}</ErrorAlert> : null}
        {remove.error ? <ErrorAlert>{remove.error.message}</ErrorAlert> : null}
        <div className="flex flex-wrap gap-2">
          <PrimaryButton type="submit" pending={upload.isPending} pendingLabel="Uploading">
            {photoUrl ? "Replace photo" : "Upload photo"}
          </PrimaryButton>
          {photoUrl ? (
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                if (
                  await confirmAction({
                    title: "Remove profile photo?",
                    description: `${name} will show initials until a new photo is added.`,
                    confirmLabel: "Remove photo",
                    destructive: true,
                  })
                )
                  remove.mutate();
              }}
            >
              Remove photo
            </Button>
          ) : null}
        </div>
      </form>
    </FormDialog>
  );
}
