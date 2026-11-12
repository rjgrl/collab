import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import {
  ACCOUNT_PHOTO_TYPES,
  MAX_ACCOUNT_PHOTO_BYTES,
} from "@Alumni-Tracking-Ss/contracts/account-photo";
import { queryClient } from "@/lib/api";
import { removeAccountPhoto, uploadAccountPhoto } from "@/lib/account-photo";
import { PhotoEditorView, usePhotoEditor } from "@/components/account/photo-editor";

export function AccountPhotoControls({ image, name }: { image?: string | null; name: string }) {
  const id = useId();
  const editor = usePhotoEditor(image);
  const [progress, setProgress] = useState(0);
  // One save applies whatever is pending: a removal, a new photo, or a repositioned one.
  const save = useMutation({
    mutationFn: async () => {
      if (editor.removed) {
        await removeAccountPhoto();
        return "removed" as const;
      }
      if (editor.file) {
        if (!(ACCOUNT_PHOTO_TYPES as readonly string[]).includes(editor.file.type))
          throw new Error("Choose a JPEG, PNG, WebP, or GIF photo.");
        if (editor.file.size > MAX_ACCOUNT_PHOTO_BYTES)
          throw new Error("Photo must be 10 MB or smaller.");
      }
      setProgress(0);
      await uploadAccountPhoto(await editor.crop(), setProgress);
      return "saved" as const;
    },
    onSuccess: async (outcome) => {
      toast.success(outcome === "removed" ? "Profile photo removed" : "Profile photo saved");
      await queryClient.invalidateQueries();
      editor.discard();
    },
  });
  return (
    <div className="flex flex-col items-center gap-4" aria-busy={save.isPending}>
      <PhotoEditorView
        editor={editor}
        currentImage={image}
        name={name}
        inputId={id}
        accessibleLabel="Profile photo"
        accept={ACCOUNT_PHOTO_TYPES.join(",")}
        disabled={save.isPending}
        help="JPEG, PNG, WebP, or GIF. Maximum 10 MB."
      />
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          disabled={!editor.dirty || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving…" : editor.isNewFile ? "Upload photo" : "Save changes"}
        </Button>
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
        {image && !editor.removed ? (
          <Button type="button" variant="outline" disabled={save.isPending} onClick={editor.remove}>
            Remove photo
          </Button>
        ) : null}
      </div>
      {save.isPending && !editor.removed ? (
        <div role="status" className="w-full max-w-xs space-y-1 text-xs text-muted-foreground">
          <progress
            className="h-2 w-full"
            max={100}
            value={progress}
            aria-label="Photo upload progress"
          />
          <p>{progress === 100 ? "Saving photo…" : `Uploading photo: ${progress}%`}</p>
        </div>
      ) : null}
      {save.error ? (
        <p role="alert" className="text-sm text-destructive">
          {save.error.message}
        </p>
      ) : null}
    </div>
  );
}
