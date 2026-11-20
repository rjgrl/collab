import nodemailer from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";
import type { IntegrationEnv } from "../context";

export type GmailMessage = { from: string; to: string[]; subject: string; text: string };
type GmailTransport = {
  sendMail: (message: GmailMessage) => Promise<{ accepted: unknown[]; rejected: unknown[] }>;
  close: () => void;
};
/** Transport factory; tests replace this with a capture adapter rather than contacting Gmail. */
export const gmailSmtp = {
  create: (options: SMTPTransport.Options): GmailTransport => nodemailer.createTransport(options),
};

export function emailConfigured(env: IntegrationEnv) {
  return Boolean(env.smtpFrom && env.gmailAppPassword);
}

export async function sendEmail(
  env: IntegrationEnv,
  input: { to: string; subject: string; text: string },
) {
  if (!emailConfigured(env)) throw new Error("Gmail email delivery is not configured.");
  const transport = gmailSmtp.create({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: env.smtpFrom!, pass: env.gmailAppPassword!.replace(/\s/g, "") },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2", servername: "smtp.gmail.com" },
    dnsTimeout: 10000,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  try {
    const result = await transport.sendMail({
      from: env.smtpFrom!,
      to: [input.to],
      subject: input.subject,
      text: input.text,
    });
    if (result.accepted.length !== 1 || result.rejected.length !== 0)
      throw new Error("Email was not accepted.");
  } catch {
    // SMTP diagnostics can contain addresses and auth details. Never reflect or log them.
    throw new Error(
      "Gmail could not send the email. Check the Gmail address, App Password and sending limits.",
    );
  } finally {
    transport.close();
  }
  return { mode: "live" as const };
}
