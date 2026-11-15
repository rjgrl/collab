import type { Database } from "@Alumni-Tracking-Ss/db";
import { redactToolOutput } from "./backups/backup-service";
import { notifySuperAdmins } from "./backups/scheduler";

/** Super Admins hear about a failing job at most this often; every failure is still logged. */
export const BACKGROUND_NOTICE_INTERVAL_MS = 60 * 60_000;

const lastNotice = new Map<string, number>();

/**
 * Reports a failure in unattended work (schedulers, recovery, heartbeats) that has no request to
 * answer. It is always logged as one JSON line with credentials removed; with `notify`, active
 * Super Admins also get a notification, throttled per job so an outage does not flood them.
 * Never throws: reporting must not crash the job loop that called it.
 */
export async function reportBackgroundFailure(
  job: string,
  error: unknown,
  options: { db?: Database; notify?: string; now?: number } = {},
) {
  const message = redactToolOutput(error instanceof Error ? error.message : String(error));
  console.error(JSON.stringify({ event: "background_job_failed", job, error: message }));
  if (!options.db || !options.notify) return;
  const now = options.now ?? Date.now();
  if (now - (lastNotice.get(job) ?? -Infinity) < BACKGROUND_NOTICE_INTERVAL_MS) return;
  lastNotice.set(job, now);
  await notifySuperAdmins(options.db, `${options.notify} Check the server log for details.`).catch(
    (notifyError: unknown) =>
      console.error(
        JSON.stringify({
          event: "background_notice_failed",
          job,
          error: redactToolOutput(
            notifyError instanceof Error ? notifyError.message : String(notifyError),
          ),
        }),
      ),
  );
}

/** Test hook: forget when each job last notified. */
export function resetBackgroundNotices() {
  lastNotice.clear();
}
