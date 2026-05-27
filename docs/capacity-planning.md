# Checks Capacity Planning

This document captures the current capacity-planning baseline for migrating the legacy Checks workload into the new Spring Boot backend.

## Current Inputs

- Daily peak check executions: `35,000/day`
- Peak execution rate: `1,500/minute`
- Average execution duration: `4 seconds`
- Maximum single execution duration: `60 seconds`

## Derived Load

- Average daily rate: `35,000 / 86,400 = ~0.4 executions/sec`
- Peak rate: `1,500 / 60 = 25 executions/sec`
- Peak average concurrency: `25 executions/sec x 4 sec = ~100 concurrent executions`
- Sustained peak equivalent: `1,500/minute = 90,000/hour`

Daily volume is modest. The main capacity driver is the bursty peak minute.

## Planning Assumptions

Until more legacy telemetry is available, use these sizing assumptions:

- Peak duration: `15 minutes`
- Duration distribution: `p95 ~12s`, `p99 ~30s`, rare executions hit `60s`
- Traffic mix: `90%` scheduled executions, `10%` manual/API-triggered executions
- Schedule lag SLO: scheduled checks should start within `1 minute` during peak
- Execution headroom: `2.5x` over average peak concurrency
- Dispatch headroom: `2x` over observed peak dispatch rate
- Database headroom: at least `2x` observed peak write rate

## Recommended Baseline

- Effective execution slots: `250`
- Scheduler dispatch target: `3,000 executions/minute`
- Database write target: at least `50 execution_result inserts/sec + 50 checks updates/sec`
- Worker topology: at least `2` worker replicas for failover, while assuming one active ShedLock scheduler leader unless queueing or sharding is added
- API topology: scale independently from workers based on API RPS and core-service latency

## Current Backend Gap

The current default backend settings are below the observed peak:

- `checks.scheduling.batch-size: 100`
- `checks.scheduling.poll-interval-ms: 30000`
- Default scheduler dispatch capacity: `100 every 30s = 200/minute`
- Default `checkExecutor` capacity: `checks.executor.semaphore-multiplier x spring.datasource.hikari.maximum-pool-size`
- With defaults, executor capacity is `4 x 10 = 40 permits/JVM`

For the migration baseline, the scheduler needs capacity above `1,500/minute`, and the active execution path needs around `250` effective concurrent execution slots.

## Suggested Initial Configuration Direction

Use these as starting points for load testing, not final production values:

- Increase scheduler throughput to about `3,000/minute`, for example:
  - `checks.scheduling.batch-size: 500`
  - `checks.scheduling.poll-interval-ms: 10000`
- Decouple execution concurrency from Hikari pool size with an explicit setting such as `checks.executor.max-concurrency`.
- Start load tests around `250` execution permits.
- Keep Hikari sized for database work, not total external I/O concurrency.
- Add per-source concurrency caps so one slow integration cannot consume all execution capacity.

Example slot allocation:

- HTTP/TCP checks: `150`
- Splunk/Grafana/ITRS/AppDynamics combined: `75`
- Manual execution burst reserve: `25`

## Architecture Watchpoints

- ShedLock gives scheduler failover, but not linear scheduled throughput from more worker replicas.
- If the one-minute schedule-lag SLO is strict under peak load, consider scheduler sharding or durable queueing.
- If p99 execution duration approaches `60s` during peak, in-process execution alone becomes risky.
- Current in-memory API rate limits scale per API replica, not globally.
- Every execution result insert also updates the parent `checks` row through the database trigger.
- Report delivery is sequential in the dispatcher loop and should be kept separate from execution peak tests.

## Storage Estimate

- `35,000 executions/day`
- `~1.05M execution rows/month`
- `~12.8M execution rows/year`

This is well below the original architecture target of `1M+ records/day`, but retention, result payload size, report HTML storage, and UI test artifacts still need confirmation.

## Validation Questions

- Is the `1,500/minute` peak a single minute, a 15-minute burst, or a longer plateau?
- What are actual p95 and p99 execution durations by check type?
- How many executions hit or approach the `60s` maximum?
- What is the check type mix during peak?
- What concurrency and RPS limits apply to Splunk, Grafana, ITRS, AppDynamics, SMTP, CSI, core-service, and monitored HTTP targets?
- What is the accepted schedule lag during peak migration traffic?
- What are the production Postgres tier, max connections, IOPS, WAL/backup limits, and PgBouncer plan?
