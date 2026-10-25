import { useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@Alumni-Tracking-Ss/ui/lib/utils";
import { ENV } from "../env";

export function AccountAvatar({
  image,
  name,
  className,
}: {
  image?: string | null;
  name: string;
  className?: string;
}) {
  const [failedImage, setFailedImage] = useState<string>();
  const source = image?.startsWith("/api/")
    ? `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}${image}${/^\/api\/(?:me\/)?files\/[a-f\d]{24}$/i.test(image) ? "?preview=1" : ""}`
    : image;
  return (
    <span
      className={cn(
        "inline-flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border bg-muted text-muted-foreground",
        className,
      )}
    >
      {source && failedImage !== source ? (
        <img
          src={source}
          alt={`${name}'s profile photo`}
          className="size-full object-cover"
          onError={() => setFailedImage(source)}
        />
      ) : (
        <UserRound className="size-1/2" role="img" aria-label={`${name}'s profile`} />
      )}
    </span>
  );
}
