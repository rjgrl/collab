import { test, expect, request as newRequest } from "@playwright/test";

const API = "http://127.0.0.1:3101/api/v1";
const ORIGIN = { Origin: "http://127.0.0.1:3101" };
const FIXTURE = "http://127.0.0.1:3100/__test";
const pdf = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n");

async function signedIn(email: string) {
  const ctx = await newRequest.newContext({ baseURL: "http://127.0.0.1:3101" });
  await ctx.post(`${API}/auth/login`, {
    headers: ORIGIN,
    data: { email, password: "BrowserTest123!", recaptchaFallback: true },
  });
  return ctx;
}
const tally = (codes: number[]) =>
  Object.fromEntries(
    [...new Set(codes)].map((code) => [code, codes.filter((c) => c === code).length]),
  );

test("one alumnus cannot flood uploads, jobs or staff notifications", async ({ request }) => {
  test.skip(test.info().project.name !== "desktop", "API-only check; one run is enough");
  test.setTimeout(120_000);
  await request.post(`${FIXTURE}/reset`);
  await request.post(`${FIXTURE}/staff`);
  await request.post(`${FIXTURE}/assign-staff`);
  await request.post(`${FIXTURE}/alumni`);
  const alumni = await signedIn("alumni@example.test");

  const uploads: number[] = [];
  for (let i = 0; i < 25; i++)
    uploads.push(
      (
        await alumni.post(`${API}/me/files`, {
          headers: ORIGIN,
          multipart: {
            kind: "evidence",
            file: { name: `proof-${i}.pdf`, mimeType: "application/pdf", buffer: pdf },
          },
        })
      ).status(),
    );
  // At most 20 uploads in any 10 minutes, then a clear "wait" answer.
  expect(tally(uploads)).toEqual({ 201: 20, 429: 5 });

  const jobs: number[] = [];
  for (let i = 0; i < 32; i++)
    jobs.push(
      (
        await alumni.post(`${API}/me/employments`, {
          headers: ORIGIN,
          data: { employer: `Employer ${i}` },
        })
      ).status(),
    );
  expect(tally(jobs)).toEqual({ 201: 30, 400: 2 });

  // Twenty uploads became one unread notice for the assigned tracker.
  const staff = await signedIn("staff@example.test");
  const notices = await (await staff.get(`${API}/notifications`)).json();
  expect(notices.unreadCount).toBe(1);
  expect(notices.items[0].summary).toMatch(
    /uploaded new files for tracking review, most recently proof-19\.pdf/,
  );
});
