import { useEffect, useRef, useState } from "react";

type EnterpriseApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => number;
  reset: (id: number) => void;
};
declare global {
  interface Window {
    grecaptcha?: { enterprise?: EnterpriseApi };
    collabCaptchaReady?: () => void;
  }
}
let sdk: Promise<EnterpriseApi> | undefined;
function loadCaptcha() {
  if (window.grecaptcha?.enterprise?.render) return Promise.resolve(window.grecaptcha.enterprise);
  return (sdk ??= new Promise<EnterpriseApi>((resolve, reject) => {
    const script = document.createElement("script");
    window.collabCaptchaReady = () => {
      if (window.grecaptcha?.enterprise) resolve(window.grecaptcha.enterprise);
    };
    script.src =
      "https://www.google.com/recaptcha/enterprise.js?onload=collabCaptchaReady&render=explicit";
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

/** Google Cloud Fraud Defense (reCAPTCHA Enterprise) checkbox; the server verifies the action. */
export function Recaptcha({
  siteKey,
  action,
  onToken,
}: {
  siteKey: string;
  action: "LOGIN" | "SIGNUP";
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
          action,
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
  }, [siteKey, action, onToken]);
  return (
    <div>
      <div ref={container} aria-label="Google reCAPTCHA" />
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
