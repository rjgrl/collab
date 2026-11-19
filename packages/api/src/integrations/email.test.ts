import assert from "node:assert/strict";
import { it } from "node:test";
import { gmailSmtp, sendEmail, type GmailMessage } from "./email";

const env = { smtpFrom: "sender@gmail.com", gmailAppPassword: "abcd efgh ijkl mnop" };
const message = { to: "recipient@example.test", subject: "Test", text: "Hello" };

it("uses Gmail with verified implicit TLS, sender-bound login and a normalized App Password", async (t) => {
  let mail: GmailMessage | undefined;
  let closed = false;
  t.mock.method(gmailSmtp, "create", (options: Parameters<typeof gmailSmtp.create>[0]) => {
    assert.equal(options.host, "smtp.gmail.com");
    assert.equal(options.port, 465);
    assert.equal(options.secure, true);
    assert.equal(options.tls?.rejectUnauthorized, true);
    assert.equal(options.tls?.minVersion, "TLSv1.2");
    assert.equal(options.tls?.servername, "smtp.gmail.com");
    assert.deepEqual(options.auth, { user: env.smtpFrom, pass: "abcdefghijklmnop" });
    assert.equal(options.disableFileAccess, true);
    assert.equal(options.disableUrlAccess, true);
    assert.equal(options.logger, false);
    assert.equal(options.debug, false);
    assert.equal(options.dnsTimeout, 10000);
    assert.equal(options.connectionTimeout, 10000);
    assert.equal(options.greetingTimeout, 10000);
    assert.equal(options.socketTimeout, 15000);
    return {
      sendMail: async (input: GmailMessage) => {
        mail = input;
        return { accepted: [input.to[0]], rejected: [] };
      },
      close: () => {
        closed = true;
      },
    };
  });
  await sendEmail({ ...env, smtpUrl: "https://127.0.0.1/ignored" }, message);
  assert.deepEqual(mail, {
    from: env.smtpFrom,
    to: [message.to],
    subject: message.subject,
    text: message.text,
  });
  assert.ok(!JSON.stringify(mail).includes(env.gmailAppPassword));
  assert.equal(closed, true);
});

it("rejects SMTP errors or recipient refusal without exposing SMTP/auth diagnostics, and closes transport", async (t) => {
  let closed = 0;
  t.mock.method(gmailSmtp, "create", () => ({
    sendMail: async () => {
      throw new Error("private auth diagnostics");
    },
    close: () => {
      closed++;
    },
  }));
  await assert.rejects(
    sendEmail(env, message),
    (error: Error) => error.message.includes("Gmail") && !error.message.includes("private"),
  );
  assert.equal(closed, 1);
  t.mock.method(gmailSmtp, "create", () => ({
    sendMail: async () => ({ accepted: [], rejected: [message.to] }),
    close: () => {
      closed++;
    },
  }));
  await assert.rejects(sendEmail(env, message), /Gmail/);
  assert.equal(closed, 2);
  await assert.rejects(sendEmail({}, message), /not configured/);
});
