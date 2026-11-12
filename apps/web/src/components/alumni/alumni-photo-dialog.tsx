import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { FormDialog } from "@Alumni-Tracking-Ss/ui/components/form-dialog";
import { PhotoEditorView, usePhotoEditor } from "@/components/account/photo-editor";
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
  const editor = usePhotoEditor(photoUrl);
  const [progress, setProgress] = useState(0);
  // One save applies whatever is pending: a removal, a new photo, or a repositioned one.
  const save = useMutation({
    mutationFn: async () => {
      if (editor.removed)
        return { removed: true, result: await client.alumni.removePhoto({ alumniId }) };
      setProgress(0);
      return {
        removed: false,
        result: await uploadProfileFile({
          file: await editor.crop(),
          kind: "image",
          alumniId,
          onProgress: setProgress,
        }),
      };
    },
    onSuccess: async ({ removed }) => {
      toast.success(removed ? "Profile photo removed" : "Profile photo saved");
      await queryClient.invalidateQueries();
      onClose();
    },
  });
  return (
    <FormDialog
      open
      onOpenChange={(open) => !open && onClose()}
      pending={save.isPending}
      title="Change profile photo"
      description={`Set, adjust or remove the photo shown for ${name}.`}
    >
      <form
        className="flex flex-col items-center gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <PhotoEditorView
          editor={editor}
          currentImage={photoUrl}
          name={name}
          inputId={`${id}-photo`}
          accessibleLabel="Choose profile photo"
          accept="image/jpeg,image/png,image/webp"
          disabled={save.isPending}
          help="JPEG, PNG or WebP, up to 10 MB."
        />
        {save.isPending && !editor.removed ? (
          <p role="status" className="text-sm">
            Uploading {progress}%
          </p>
        ) : null}
        {save.error ? <ErrorAlert>{save.error.message}</ErrorAlert> : null}
        <div className="flex flex-wrap justify-center gap-2">
          <PrimaryButton
            type="submit"
            pending={save.isPending}
            pendingLabel="Saving"
            disabled={!editor.dirty}
          >
            {editor.isNewFile ? "Upload photo" : "Save changes"}
          </PrimaryButton>
          {editor.dirty ? (
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={editor.discard}
            >
              Discard changes
            </Button>
          ) : null}
          {photoUrl && !editor.removed ? (
            <Button
              type="button"
              variant="destructive"
              disabled={save.isPending}
              onClick={editor.remove}
            >
              Remove photo
            </Button>
          ) : null}
        </div>
      </form>
    </FormDialog>
  );
}
