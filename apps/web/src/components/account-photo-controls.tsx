import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@Alumni-Tracking-Ss/ui/components/button";
import { Input } from "@Alumni-Tracking-Ss/ui/components/input";
import {
  ACCOUNT_PHOTO_TYPES,
  MAX_ACCOUNT_PHOTO_BYTES,
} from "@Alumni-Tracking-Ss/contracts/account-photo";
import { queryClient } from "@/utils/api";
import { removeAccountPhoto, uploadAccountPhoto } from "@/utils/account-photo";
import { AccountAvatar } from "./account-avatar";

export function AccountPhotoControls({ image, name }: { image?: string | null; name: string }) {
  const id = useId();
  const [file, setFile] = useState<File>();
  const [inputKey, setInputKey] = useState(0);
  const [progress, setProgress] = useState(0);
  const mutation = useMutation({
    mutationFn: async (action: "upload" | "remove") => {
      if (action === "remove") return removeAccountPhoto();
      if (!file) throw new Error("Choose a photo before uploading.");
      if (!(ACCOUNT_PHOTO_TYPES as readonly string[]).includes(file.type))
        throw new Error("Choose a JPEG, PNG, WebP, or GIF photo.");
      if (file.size > MAX_ACCOUNT_PHOTO_BYTES) throw new Error("Photo must be 10 MB or smaller.");
      setProgress(0);
      return uploadAccountPhoto(file, setProgress);
    },
    onSuccess: async (_result, action) => {
      setFile(undefined);
      setInputKey((value) => value + 1);
      toast.success(action === "remove" ? "Profile photo removed" : "Profile photo updated");
      await queryClient.invalidateQueries();
    },
  });
  return (
    <div className="space-y-3" aria-busy={mutation.isPending}>
      <div className="flex flex-wrap items-center gap-4">
        <AccountAvatar image={image} name={name} className="size-20" />
        <div className="min-w-0 flex-1 space-y-2">
          <label className="text-sm font-medium" htmlFor={id}>
            Profile photo
          </label>
          <Input
            key={inputKey}
            id={id}
            type="file"
            accept={ACCOUNT_PHOTO_TYPES.join(",")}
            disabled={mutation.isPending}
            aria-describedby={`${id}-help`}
            onChange={(event) => {
              setFile(event.target.files?.[0]);
              mutation.reset();
            }}
          />
          <p id={`${id}-help`} className="text-xs text-muted-foreground">
            JPEG, PNG, WebP, or GIF. Maximum 10 MB.
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={!file || mutation.isPending}
          onClick={() => mutation.mutate("upload")}
        >
          {mutation.isPending && mutation.variables === "upload"
            ? "Uploading…"
            : image
              ? "Replace photo"
              : "Upload photo"}
        </Button>
        {image ? (
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
        <div role="status" className="space-y-1 text-xs text-muted-foreground">
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
