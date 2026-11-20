import { gmailSmtp, type GmailMessage } from "../integrations/email";

/** Test-only adapter: records messages without network access, returning Gmail-style acceptance. */
export function captureEmail(handler: (message: GmailMessage) => void | Promise<void>) {
  const original = gmailSmtp.create;
  gmailSmtp.create = () => ({
    sendMail: async (message) => {
      await handler(message);
      return { accepted: message.to, rejected: [] };
    },
    close: () => {},
  });
  return () => {
    gmailSmtp.create = original;
  };
}
