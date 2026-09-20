---
name: springboottest-metrics-export-off
description: @SpringBootTest turns metrics export off, so /actuator/prometheus is absent in every IT unless @AutoConfigureObservability — a "404 = not exposed" test is vacuous without it
metadata:
  type: project
---

In backend ITs, `@SpringBootTest` sets `management.defaults.metrics.export.enabled` to false, so `PrometheusMetricsExportAutoConfiguration` backs off and `/actuator/prometheus` does not exist, whatever the exposure list says. Found in Studio v1 WP7 (2026-09-18): the worker scrape test got 403 (a 404 on the worker's denyAll chain), and an API-side "scrape answers 404" check would have passed for the wrong reason.

**Why:** a negative exposure assertion without the registry built is one of the [[vacuous-guard-shapes]]. It passes whether or not the exposure is restricted.

**How to apply:** put `@AutoConfigureObservability(tracing = false)` on any IT that asserts on the scrape endpoint. Pair the 404 with a positive companion: the `PrometheusMeterRegistry` bean exists, and `/actuator/info` answers 200. `/actuator/health` answers 503 under `local,api`, so it can't serve as the companion. Then re-add `prometheus` to the exposure and confirm the test goes red.
