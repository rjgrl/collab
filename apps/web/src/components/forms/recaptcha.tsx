import { useEffect, useRef, useState } from "react";

type CaptchaApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => number;
  reset: (id: number) => void;
};
declare global {
  interface Window {
    grecaptcha?: CaptchaApi;
    collabCaptchaReady?: () => void;
  }
}
let sdk: Promise<CaptchaApi> | undefined;
function loadCaptcha() {
  if (window.grecaptcha?.render) return Promise.resolve(window.grecaptcha);
  return (sdk ??= new Promise<CaptchaApi>((resolve, reject) => {
    const script = document.createElement("script");
    window.collabCaptchaReady = () => {
      if (window.grecaptcha) resolve(window.grecaptcha);
    };
    script.src =
      "https://www.google.com/recaptcha/api.js?onload=collabCaptchaReady&render=explicit";
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      sdk = undefined;
      script.remove();
      reject(new Error("Unable to load the bot check. Reload to retry."));
    };
    document.head.append(script);
  }));
}

export function Recaptcha({
  siteKey,
  onToken,
}: {
  siteKey: string;
  onToken: (token: string | undefined) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    const element = container.current;
    void loadCaptcha()
      .then((api) => {
        if (disposed || !element) return;
        api.render(element, {
          sitekey: siteKey,
          callback: onToken,
          "expired-callback": () => onToken(undefined),
          "error-callback": () => {
            onToken(undefined);
            setError("The bot check failed. Reload to retry.");
          },
        });
      })
      .catch((failure: unknown) => {
        if (!disposed)
          setError(failure instanceof Error ? failure.message : "Bot check unavailable.");
      });
    return () => {
      disposed = true;
      element?.replaceChildren();
    };
  }, [siteKey, onToken]);
  return (
    <div>
      <div ref={container} aria-label="Google reCAPTCHA" />
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
