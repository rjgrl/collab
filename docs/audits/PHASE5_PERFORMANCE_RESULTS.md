# Phase 5 bounded performance results

2026-10-19. Reproducer: `pnpm test:staging-local`; [frozen evidence](PHASE5_PERFORMANCE_RESULTS.json). Windows / Node 26.10.0, Ryzen 7 9800X3D, 16 logical CPUs, 31.14 GiB RAM; MongoDB 9.0.2 loopback replica set. Client/server share one process; the database server has other local clients. No TLS overhead, external provider traffic, production dataset or sustained stress.

Measured dataset: 1,000 synthetic alumni, one department/program and a synthetic MFA-enrolled administrator. Per cohort: one warm request, 40 measured HTTP requests, concurrency four. Login/MFA are single observations; Forms uses 12 sequential commits. Total measured read/export requests: 240. Do not combine these distinct short cohorts into a sustained-capacity estimate.

| Workflow              | p50 ms | p95 ms | p99 ms | Observed RPS | Combined client/server CPU ms | Errors |
| --------------------- | ------ | ------ | ------ | ------------ | ----------------------------- | ------ |
| Session validation    | 6.69   | 260.20 | 260.30 | 153.45       | 187                           | 0      |
| Tracked alumni page   | 34.65  | 43.57  | 289.87 | 95.38        | 235                           | 0      |
| Substring search      | 14.28  | 16.24  | 16.27  | 270.96       | 250                           | 0      |
| Page 20               | 59.67  | 69.72  | 70.62  | 64.18        | 422                           | 0      |
| Dashboard aggregation | 63.77  | 277.78 | 289.19 | 44.47        | 187                           | 0      |
| 1,000-row CSV         | 90.68  | 128.07 | 128.40 | 40.54        | 1,547                         | 0      |

Cold strong-scrypt login: 229.38 ms; MFA confirmation/rotation: 25.38 ms. These single values are not percentiles. Raw JSON includes per-cohort RSS before/after and global server connection counters. CPU time can exceed wall time due to multiple threads; it includes the test client/Prisma and is not database CPU utilization. RSS changes and latency outliers do not by themselves establish leaks or causes. With only 40 samples, p99 is effectively the maximum.

The 12 sequential Forms commits took 131.34 ms. CSV cohort RSS rose from 190.36 to 248.69 MiB in the combined process; no forced GC or leak/soak inference is warranted. CPU utilization and DB CPU were not independently sampled.

After measurement, a bounded additional 9,001 synthetic rows exercises exact export boundaries: 10,000 returns a CSV/count of 10,000; 10,001 returns 400. This does not change the measured 1,000-row workload. All fixtures remain in a new `collab_phase5_*` database, Forms disabled at end; no existing data/index was touched.

## Query plan comparison

A representative direct query filters isTracked and sorts lastName/firstName/_id with limit 20. Before the candidate index, execution examined 500 keys/documents. A compound `{isTracked:1,lastName:1,firstName:1,_id:1}` index in the disposable database reduces this to 20 keys/documents. Both plans return 20 rows. This isolates a possible sort/filter benefit, not the full Prisma relation-lookup aggregate pipeline. No application index was added: validate actual Prisma plans, storage/write cost and a realistic population first.

Existing pagination keeps stable ID ties; earlier HTTP checks verify page disjointness. Deep skip, substring search, unbounded nested profile histories, CSV memory/CPU and repeated authorization queries still require growth testing. The database client retains its eight-second server-selection bound. No connection-pool tuning was justified by this short run.

Resilience/proxy checks: two clients behind a trusted peer receive distinct budgets; direct forged forwarding cannot reset a peer budget; malformed/missing/chained trusted forwarding shares unknown allowance. Production cookie attributes and stored client IP pass on a loopback HTTP simulation. Disconnecting only the runner's Prisma client and requesting again reconnects successfully; the shared MongoDB service was not stopped. True process interruption, replica failover, pool exhaustion, slow clients, alerts and long soak remain NOT TESTED.
