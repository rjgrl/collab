import { accountPhotoResultSchema } from "@Alumni-Tracking-Ss/contracts/account-photo";
import { ENV } from "../env";
import { readJson } from "./api";

const endpoint = `${ENV.VITE_SERVER_URL.replace(/\/$/, "")}/api/me/photo`;
export function uploadAccountPhoto(file: File, onProgress: (progress: number) => void) {
  return new Promise<{ image: string | null }>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", endpoint);
    request.withCredentials = true;
    request.timeout = 60_000;
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onerror = () =>
      reject(new Error("Upload failed. Check your connection and try again."));
    request.ontimeout = () => reject(new Error("Upload timed out. Try again."));
    request.onload = () => {
      void readJson(
        new Response(request.responseText, { status: request.status }),
        accountPhotoResultSchema,
      ).then(resolve, reject);
    };
    const body = new FormData();
    body.append("file", file);
    request.send(body);
  });
}
export async function removeAccountPhoto() {
  return readJson(
    await fetch(endpoint, { method: "DELETE", credentials: "include" }),
    accountPhotoResultSchema,
  );
}
