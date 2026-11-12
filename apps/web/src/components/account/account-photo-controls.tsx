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
  const editor = usePhotoEditor();
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: async (action: "upload" | "remove") => {
      if (action === "remove") return removeAccountPhoto();
      if (!editor.file) throw new Error("Choose a photo before uploading.");
      if (!(ACCOUNT_PHOTO_TYPES as readonly string[]).includes(editor.file.type))
        throw new Error("Choose a JPEG, PNG, WebP, or GIF photo.");
      if (editor.file.size > MAX_ACCOUNT_PHOTO_BYTES)
        throw new Error("Photo must be 10 MB or smaller.");
      setProgress(0);
      return uploadAccountPhoto(await editor.crop(), setProgress);
    },
    onSuccess: async (_result, action) => {
      editor.reset();
      toast.success(action === "remove" ? "Profile photo removed" : "Profile photo updated");
      await queryClient.invalidateQueries();
    },
  });
  return (
    <div className="flex flex-col items-center gap-4" aria-busy={mutation.isPending}>
      <PhotoEditorView
        editor={editor}
        currentImage={image}
        name={name}
        inputId={id}
        accessibleLabel="Profile photo"
        accept={ACCOUNT_PHOTO_TYPES.join(",")}
        disabled={mutation.isPending}
        help="JPEG, PNG, WebP, or GIF. Maximum 10 MB."
      />
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          type="button"
          disabled={!editor.loaded || mutation.isPending}
          onClick={() => mutation.mutate("upload")}
        >
          {mutation.isPending && mutation.variables === "upload"
            ? "Uploading…"
            : image
              ? "Replace photo"
              : "Upload photo"}
        </Button>
        {editor.file ? (
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={editor.reset}
          >
            Discard
          </Button>
        ) : image ? (
          <Button
            type="button"
            variant="outline"
            disabled={mutation.isPending}
            onClick={() => mutation.mutate("remove")}
          >
            {mutation.isPending && mutation.variables === "remove" ? "Removing…" : "Remove photo"}
          </Button>
        ) : null}
      </div>
      {mutation.isPending && mutation.variables === "upload" ? (
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
      {mutation.error ? (
        <p role="alert" className="text-sm text-destructive">
          {mutation.error.message}
        </p>
      ) : null}
    </div>
  );
}
