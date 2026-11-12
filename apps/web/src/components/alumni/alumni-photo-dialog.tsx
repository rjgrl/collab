import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { PhotoEditorView, usePhotoEditor } from "@/components/account/photo-editor";
import { useConfirm } from "@/components/feedback/confirm-provider";
import { ErrorAlert } from "@/components/feedback/error-alert";
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
  const editor = usePhotoEditor();
  const [progress, setProgress] = useState(0);
  const upload = useMutation({
    mutationFn: async () => {
      if (!editor.loaded) throw new Error("Choose a photo before uploading.");
      setProgress(0);
      return uploadProfileFile({
        file: await editor.crop(),
        kind: "image",
        alumniId,
        onProgress: setProgress,
      });
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
        className="flex flex-col items-center gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          upload.mutate();
        }}
      >
        <PhotoEditorView
          editor={editor}
          currentImage={photoUrl}
          name={name}
          inputId={`${id}-photo`}
          accessibleLabel="Choose profile photo"
          accept="image/jpeg,image/png,image/webp"
          disabled={pending}
          help="JPEG, PNG or WebP, up to 10 MB."
        />
        {upload.isPending ? (
          <p role="status" className="text-sm">
            Uploading {progress}%
          </p>
        ) : null}
        {upload.error ? <ErrorAlert>{upload.error.message}</ErrorAlert> : null}
        {remove.error ? <ErrorAlert>{remove.error.message}</ErrorAlert> : null}
        <div className="flex flex-wrap justify-center gap-2">
          <PrimaryButton
            type="submit"
            pending={upload.isPending}
            pendingLabel="Uploading"
            disabled={!editor.loaded}
          >
            {photoUrl ? "Replace photo" : "Upload photo"}
          </PrimaryButton>
          {editor.file ? (
            <Button type="button" variant="outline" disabled={pending} onClick={editor.reset}>
              Discard
            </Button>
          ) : photoUrl ? (
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                if (
                  await confirmAction({
                    title: "Remove profile photo?",
                    description: `${name} will show a placeholder until a new photo is added.`,
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
