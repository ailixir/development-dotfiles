-- R__dev_sample_data.sql
-- Dev-only sample data for development and presentations.
-- Loaded exclusively by the "dev" Spring profile via spring.flyway.locations.
--
-- Idempotency: INSERTs use ON CONFLICT DO NOTHING, except ui_test_executions
--              (partition key in the PK) which uses NOT EXISTS on the id.
-- Trigger: execution_results INSERT fires update_check_status_from_execution,
--          propagating the final status to each check automatically.
--
-- Traces: FR-DEV-01..08, CON-DEV-01..07 (see docs/specs/dev-seed/spec.md)

-- ═══════════════════════════════════════════════════════════════
-- 0. Defensive partition creation (FEAS-01)
--    Ensures current-month partition exists before execution_results INSERT,
--    even on first startup in months after May 2026.
-- ═══════════════════════════════════════════════════════════════

DO $$
DECLARE
  partition_name TEXT;
  range_start    DATE;
  range_end      DATE;
BEGIN
  partition_name := 'execution_results_' || to_char(CURRENT_DATE, 'YYYY_MM');
  range_start    := date_trunc('month', CURRENT_DATE);
  range_end      := (date_trunc('month', CURRENT_DATE) + INTERVAL '1 month')::date;

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF execution_results FOR VALUES FROM (%L) TO (%L)',
    partition_name, range_start, range_end
  );
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 1. Users (5 rows)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO users (id, sso_id, name, email, department, is_active, created_at) VALUES
  ('a1b2c3d4-0001-4000-8000-000000000001', 'bb12345', 'Bruno Buger',    'bruno.buger@citi.com', 'Technology Operations',     true, NOW() - INTERVAL '90 days'),
  ('a1b2c3d4-0001-4000-8000-000000000002', 'de78901', 'Daniel Estevez', 'daniel.estevez@citi.com',     'Site Reliability Engineering', true, NOW() - INTERVAL '85 days'),
  ('a1b2c3d4-0001-4000-8000-000000000003', 'rp45678', 'Raj Patel',      'raj.patel@citi.com',          'Quality Assurance',         true, NOW() - INTERVAL '80 days'),
  ('a1b2c3d4-0001-4000-8000-000000000004', 'lw23456', 'Lisa Wang',      'lisa.wang@citi.com',     'Software Engineering',      true, NOW() - INTERVAL '75 days'),
  ('a1b2c3d4-0001-4000-8000-000000000005', 'mc67890', 'Mike Chen',      'mike.chen@citi.com',     'Engineering Management',    true, NOW() - INTERVAL '70 days'),
  ('a1b2c3d4-0001-4000-8000-000000000099', 'dev-user', 'Local Developer', 'local.dev@citi.com',     'Development',               true, NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 2. CSI Systems (3 rows)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO csi_systems (id, name, description, business_unit, criticality, owner_email, environment, status, metadata) VALUES
  ('178672', 'Production Unified Toolkit',
   'Unified operational command center — monitoring orchestration, automated communications, and operational automation. Modules: Checks, Comms, Scripts, Workflows, Solutions.',
   'Technology', 'CRITICAL', 'bruno.buger@citi.com', 'Production', 'OPERATIONAL',
   '{"region":"NA","datacenter":"NY4","tier":"tier-1","oncall_team":"put-platform-sre","modules":["checks","comms","scripts","workflows","solutions"]}'::jsonb),

  ('285614', 'Trade Settlement Engine',
   'Equity and fixed-income trade matching, confirmation, and settlement engine.',
   'Securities Services', 'HIGH', 'daniel.estevez@citi.com', 'Production', 'DEGRADED',
   '{"region":"NA","datacenter":"NY4","tier":"tier-1","oncall_team":"trading-sre"}'::jsonb),

  ('396705', 'Developer Portal',
   'Internal developer portal for API documentation, SDK downloads, and sandbox environments.',
   'Technology', 'MEDIUM', 'lisa.wang@citi.com', 'Production', 'OPERATIONAL',
   '{"region":"GLOBAL","datacenter":"NJ2","tier":"tier-3","oncall_team":"platform-eng"}'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 3. Checks (15 rows)
--    Status starts as PENDING; the execution_results trigger updates it.
-- ═══════════════════════════════════════════════════════════════

-- 178672: Production Unified Toolkit (5 checks — 4 PASSING, 1 FAILING)
INSERT INTO checks (id, name, type, csi_id, csi_name, description, environment, configuration, status, created_by, created_at, updated_at) VALUES
  ('b2c3d4e5-0001-4000-8000-000000000001',
   'PUT Shell Health', 'HTTP', '178672', 'Production Unified Toolkit',
   'Platform shell health endpoint — serves the unified UI and module federation host', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://put.internal.citi.com/health","expectedStatusCode":200,"timeoutMs":5000,"followRedirects":true,"verifyTls":true}'::jsonb,
   'PENDING', 'bruno.buger@citi.com', NOW() - INTERVAL '60 days', NOW()),

  ('b2c3d4e5-0001-4000-8000-000000000002',
   'PUT Core Service', 'HTTP', '178672', 'Production Unified Toolkit',
   'Core service — SSO session introspection, RBAC, and CSI ownership resolution', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://put-core.internal.citi.com/actuator/health","expectedStatusCode":200,"timeoutMs":3000,"followRedirects":false,"verifyTls":true}'::jsonb,
   'PENDING', 'bruno.buger@citi.com', NOW() - INTERVAL '60 days', NOW()),

  ('b2c3d4e5-0001-4000-8000-000000000003',
   'Checks Module Health', 'HTTP', '178672', 'Production Unified Toolkit',
   'Checks module backend — monitoring orchestration across Grafana, Splunk, ITRS, AppDynamics', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://put-checks.internal.citi.com/actuator/health","expectedStatusCode":200,"timeoutMs":5000,"followRedirects":true,"verifyTls":true}'::jsonb,
   'PENDING', 'daniel.estevez@citi.com', NOW() - INTERVAL '55 days', NOW()),

  ('b2c3d4e5-0001-4000-8000-000000000004',
   'Comms Module Health', 'HTTP', '178672', 'Production Unified Toolkit',
   'Comms module backend — AI-powered operational communications, templates, and SMTP relay', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://put-comms.internal.citi.com/health","expectedStatusCode":200,"timeoutMs":5000,"followRedirects":true,"verifyTls":true}'::jsonb,
   'PENDING', 'bruno.buger@citi.com', NOW() - INTERVAL '60 days', NOW()),

  ('b2c3d4e5-0001-4000-8000-000000000005',
   'PUT Database Primary', 'TCP', '178672', 'Production Unified Toolkit',
   'Shared PostgreSQL primary — platform shell, checks, and comms databases', 'Production',
   '{"type":"TCP","host":"put-db-primary.internal.citi.com","port":5432,"timeoutMs":5000}'::jsonb,
   'PENDING', 'bruno.buger@citi.com', NOW() - INTERVAL '58 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- 285614: Trade Settlement Engine (6 checks — 2 PASSING, 3 FAILING, 1 WARNING)
INSERT INTO checks (id, name, type, csi_id, csi_name, description, environment, configuration, status, created_by, created_at, updated_at) VALUES
  ('b2c3d4e5-0002-4000-8000-000000000001',
   'TSE Health Endpoint', 'HTTP', '285614', 'Trade Settlement Engine',
   'Primary health check for trade settlement service', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://tse.internal.citi.com/health","expectedStatusCode":200,"timeoutMs":5000,"followRedirects":true,"verifyTls":true}'::jsonb,
   'PENDING', 'daniel.estevez@citi.com', NOW() - INTERVAL '50 days', NOW()),

  ('b2c3d4e5-0002-4000-8000-000000000002',
   'TSE Order Matching', 'HTTP', '285614', 'Trade Settlement Engine',
   'Order matching engine status — intermittent failures', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://tse.internal.citi.com/api/matching/status","expectedStatusCode":200,"timeoutMs":8000,"followRedirects":true,"verifyTls":true}'::jsonb,
   'PENDING', 'daniel.estevez@citi.com', NOW() - INTERVAL '48 days', NOW()),

  ('b2c3d4e5-0002-4000-8000-000000000003',
   'TSE Settlement Queue', 'HTTP', '285614', 'Trade Settlement Engine',
   'Settlement queue health — backlog building', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://tse.internal.citi.com/api/settlement/queue/health","expectedStatusCode":200,"timeoutMs":5000,"followRedirects":true,"verifyTls":true}'::jsonb,
   'PENDING', 'daniel.estevez@citi.com', NOW() - INTERVAL '45 days', NOW()),

  ('b2c3d4e5-0002-4000-8000-000000000004',
   'TSE Risk Calculator', 'HTTP', '285614', 'Trade Settlement Engine',
   'Risk calculation service — elevated response times', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://tse.internal.citi.com/api/risk/status","expectedStatusCode":200,"timeoutMs":10000,"followRedirects":true,"verifyTls":true}'::jsonb,
   'PENDING', 'raj.patel@citi.com', NOW() - INTERVAL '42 days', NOW()),

  ('b2c3d4e5-0002-4000-8000-000000000005',
   'TSE Database Primary', 'TCP', '285614', 'Trade Settlement Engine',
   'PostgreSQL primary instance for trade data', 'Production',
   '{"type":"TCP","host":"tse-db-primary.internal.citi.com","port":5432,"timeoutMs":5000}'::jsonb,
   'PENDING', 'daniel.estevez@citi.com', NOW() - INTERVAL '50 days', NOW()),

  ('b2c3d4e5-0002-4000-8000-000000000006',
   'TSE Message Broker', 'TCP', '285614', 'Trade Settlement Engine',
   'RabbitMQ broker connectivity — connection refused', 'Production',
   '{"type":"TCP","host":"tse-mq.internal.citi.com","port":5672,"timeoutMs":5000}'::jsonb,
   'PENDING', 'daniel.estevez@citi.com', NOW() - INTERVAL '50 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- 396705: Developer Portal (4 checks — all PASSING)
INSERT INTO checks (id, name, type, csi_id, csi_name, description, environment, configuration, status, created_by, created_at, updated_at) VALUES
  ('b2c3d4e5-0003-4000-8000-000000000001',
   'DevPortal Health', 'HTTP', '396705', 'Developer Portal',
   'Portal application health endpoint', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://devportal.internal.citi.com/health","expectedStatusCode":200,"timeoutMs":5000,"followRedirects":true,"verifyTls":true}'::jsonb,
   'PENDING', 'lisa.wang@citi.com', NOW() - INTERVAL '40 days', NOW()),

  ('b2c3d4e5-0003-4000-8000-000000000002',
   'DevPortal API Gateway', 'HTTP', '396705', 'Developer Portal',
   'API gateway routing and rate limiting', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://devportal.internal.citi.com/api/v1/status","expectedStatusCode":200,"timeoutMs":5000,"followRedirects":true,"verifyTls":true}'::jsonb,
   'PENDING', 'lisa.wang@citi.com', NOW() - INTERVAL '38 days', NOW()),

  ('b2c3d4e5-0003-4000-8000-000000000003',
   'DevPortal CDN', 'HTTP', '396705', 'Developer Portal',
   'Content delivery network health for static assets', 'Production',
   '{"type":"HTTP","method":"GET","url":"https://cdn.devportal.internal.citi.com/health","expectedStatusCode":200,"timeoutMs":3000,"followRedirects":true,"verifyTls":true}'::jsonb,
   'PENDING', 'lisa.wang@citi.com', NOW() - INTERVAL '35 days', NOW()),

  ('b2c3d4e5-0003-4000-8000-000000000004',
   'DevPortal Database', 'TCP', '396705', 'Developer Portal',
   'PostgreSQL instance for portal data', 'Production',
   '{"type":"TCP","host":"devportal-db.internal.citi.com","port":5432,"timeoutMs":5000}'::jsonb,
   'PENDING', 'lisa.wang@citi.com', NOW() - INTERVAL '40 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 4. Schedules (12 rows — 3 checks intentionally unscheduled)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO schedules (id, check_id, check_type, frequency, cron_expression, timezone, enabled, next_execution_at, created_at, updated_at) VALUES
  -- 178672: every 5 min for critical health, 15 min for services, hourly for infra
  ('c3d4e5f6-0001-4000-8000-000000000001', 'b2c3d4e5-0001-4000-8000-000000000001', 'HTTP', 'every_5m',  '0 */5 * * * *',  'UTC', true,  NOW() + INTERVAL '5 minutes',  NOW() - INTERVAL '60 days', NOW()),
  ('c3d4e5f6-0001-4000-8000-000000000002', 'b2c3d4e5-0001-4000-8000-000000000002', 'HTTP', 'every_15m', '0 */15 * * * *', 'UTC', true,  NOW() + INTERVAL '15 minutes', NOW() - INTERVAL '60 days', NOW()),
  ('c3d4e5f6-0001-4000-8000-000000000003', 'b2c3d4e5-0001-4000-8000-000000000003', 'HTTP', 'every_15m', '0 */15 * * * *', 'UTC', true,  NOW() + INTERVAL '15 minutes', NOW() - INTERVAL '55 days', NOW()),
  ('c3d4e5f6-0001-4000-8000-000000000004', 'b2c3d4e5-0001-4000-8000-000000000004', 'HTTP', 'hourly',    '0 0 * * * *',   'UTC', true,  NOW() + INTERVAL '1 hour',     NOW() - INTERVAL '60 days', NOW()),
  -- PUT Database Primary intentionally unscheduled (manual check)

  -- 285614: every 5 min for health, 15 min for services, hourly for infra
  ('c3d4e5f6-0002-4000-8000-000000000001', 'b2c3d4e5-0002-4000-8000-000000000001', 'HTTP', 'every_5m',  '0 */5 * * * *',  'UTC', true,  NOW() + INTERVAL '5 minutes',  NOW() - INTERVAL '50 days', NOW()),
  ('c3d4e5f6-0002-4000-8000-000000000002', 'b2c3d4e5-0002-4000-8000-000000000002', 'HTTP', 'every_15m', '0 */15 * * * *', 'UTC', true,  NOW() + INTERVAL '15 minutes', NOW() - INTERVAL '48 days', NOW()),
  ('c3d4e5f6-0002-4000-8000-000000000003', 'b2c3d4e5-0002-4000-8000-000000000003', 'HTTP', 'every_15m', '0 */15 * * * *', 'UTC', false, NULL,                          NOW() - INTERVAL '45 days', NOW()),
  ('c3d4e5f6-0002-4000-8000-000000000004', 'b2c3d4e5-0002-4000-8000-000000000004', 'HTTP', 'hourly',    '0 0 * * * *',   'UTC', true,  NOW() + INTERVAL '1 hour',     NOW() - INTERVAL '42 days', NOW()),
  ('c3d4e5f6-0002-4000-8000-000000000005', 'b2c3d4e5-0002-4000-8000-000000000005', 'TCP',  'hourly',    '0 0 * * * *',   'UTC', true,  NOW() + INTERVAL '1 hour',     NOW() - INTERVAL '50 days', NOW()),
  -- TSE Message Broker intentionally unscheduled (connection refused — investigating)

  -- 396705: daily for non-critical portal checks
  ('c3d4e5f6-0003-4000-8000-000000000001', 'b2c3d4e5-0003-4000-8000-000000000001', 'HTTP', 'every_5m',  '0 */5 * * * *',  'America/New_York', true, NOW() + INTERVAL '5 minutes',  NOW() - INTERVAL '40 days', NOW()),
  ('c3d4e5f6-0003-4000-8000-000000000002', 'b2c3d4e5-0003-4000-8000-000000000002', 'HTTP', 'daily',     '0 0 8 * * *',   'America/New_York', true, NOW() + INTERVAL '1 day',      NOW() - INTERVAL '38 days', NOW())
  -- DevPortal CDN and DevPortal Database intentionally unscheduled
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 5. Tags (8 rows)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO tags (id, name, category, description, color) VALUES
  ('d4e5f6a7-0001-4000-8000-000000000001', 'production',      'environment', 'Production environment resources',  '#d32f2f'),
  ('d4e5f6a7-0001-4000-8000-000000000002', 'critical-path',   'priority',    'On the critical business path',     '#f57c00'),
  ('d4e5f6a7-0001-4000-8000-000000000003', 'sre-owned',       'team',        'Owned by Site Reliability Engineering', '#1976d2'),
  ('d4e5f6a7-0001-4000-8000-000000000004', 'http-monitor',    'type',        'HTTP endpoint monitoring',          '#388e3c'),
  ('d4e5f6a7-0001-4000-8000-000000000005', 'tcp-monitor',     'type',        'TCP port connectivity monitoring',  '#7b1fa2'),
  ('d4e5f6a7-0001-4000-8000-000000000006', 'put-platform',    'domain',      'PUT platform modules',              '#0288d1'),
  ('d4e5f6a7-0001-4000-8000-000000000007', 'trading',         'domain',      'Trading and settlement domain',     '#e64a19'),
  ('d4e5f6a7-0001-4000-8000-000000000008', 'internal-tools',  'domain',      'Internal developer tooling',        '#455a64')
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 6. Check Tags (~20 junction rows)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO check_tags (check_id, tag_id) VALUES
  -- 178672 HTTP checks → http-monitor + put-platform
  ('b2c3d4e5-0001-4000-8000-000000000001', 'd4e5f6a7-0001-4000-8000-000000000004'),
  ('b2c3d4e5-0001-4000-8000-000000000001', 'd4e5f6a7-0001-4000-8000-000000000006'),
  ('b2c3d4e5-0001-4000-8000-000000000002', 'd4e5f6a7-0001-4000-8000-000000000004'),
  ('b2c3d4e5-0001-4000-8000-000000000002', 'd4e5f6a7-0001-4000-8000-000000000006'),
  ('b2c3d4e5-0001-4000-8000-000000000003', 'd4e5f6a7-0001-4000-8000-000000000004'),
  ('b2c3d4e5-0001-4000-8000-000000000003', 'd4e5f6a7-0001-4000-8000-000000000006'),
  -- 178672 TCP checks → tcp-monitor + put-platform
  ('b2c3d4e5-0001-4000-8000-000000000004', 'd4e5f6a7-0001-4000-8000-000000000005'),
  ('b2c3d4e5-0001-4000-8000-000000000004', 'd4e5f6a7-0001-4000-8000-000000000006'),
  ('b2c3d4e5-0001-4000-8000-000000000005', 'd4e5f6a7-0001-4000-8000-000000000005'),
  ('b2c3d4e5-0001-4000-8000-000000000005', 'd4e5f6a7-0001-4000-8000-000000000006'),
  -- 285614 HTTP checks → http-monitor + trading
  ('b2c3d4e5-0002-4000-8000-000000000001', 'd4e5f6a7-0001-4000-8000-000000000004'),
  ('b2c3d4e5-0002-4000-8000-000000000001', 'd4e5f6a7-0001-4000-8000-000000000007'),
  ('b2c3d4e5-0002-4000-8000-000000000002', 'd4e5f6a7-0001-4000-8000-000000000004'),
  ('b2c3d4e5-0002-4000-8000-000000000002', 'd4e5f6a7-0001-4000-8000-000000000007'),
  ('b2c3d4e5-0002-4000-8000-000000000003', 'd4e5f6a7-0001-4000-8000-000000000004'),
  ('b2c3d4e5-0002-4000-8000-000000000004', 'd4e5f6a7-0001-4000-8000-000000000004'),
  -- 285614 TCP checks → tcp-monitor + trading
  ('b2c3d4e5-0002-4000-8000-000000000005', 'd4e5f6a7-0001-4000-8000-000000000005'),
  ('b2c3d4e5-0002-4000-8000-000000000006', 'd4e5f6a7-0001-4000-8000-000000000005'),
  -- 396705 checks → internal-tools
  ('b2c3d4e5-0003-4000-8000-000000000001', 'd4e5f6a7-0001-4000-8000-000000000004'),
  ('b2c3d4e5-0003-4000-8000-000000000001', 'd4e5f6a7-0001-4000-8000-000000000008'),
  ('b2c3d4e5-0003-4000-8000-000000000002', 'd4e5f6a7-0001-4000-8000-000000000004'),
  ('b2c3d4e5-0003-4000-8000-000000000002', 'd4e5f6a7-0001-4000-8000-000000000008'),
  ('b2c3d4e5-0003-4000-8000-000000000003', 'd4e5f6a7-0001-4000-8000-000000000004'),
  ('b2c3d4e5-0003-4000-8000-000000000004', 'd4e5f6a7-0001-4000-8000-000000000005'),
  ('b2c3d4e5-0003-4000-8000-000000000004', 'd4e5f6a7-0001-4000-8000-000000000008')
ON CONFLICT (check_id, tag_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 7. CSI Tags (6 junction rows)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO csi_tags (csi_id, tag_id) VALUES
  ('178672', 'd4e5f6a7-0001-4000-8000-000000000001'),  -- production
  ('178672', 'd4e5f6a7-0001-4000-8000-000000000002'),  -- critical-path
  ('178672', 'd4e5f6a7-0001-4000-8000-000000000003'),  -- sre-owned
  ('285614', 'd4e5f6a7-0001-4000-8000-000000000001'),  -- production
  ('285614', 'd4e5f6a7-0001-4000-8000-000000000003'),  -- sre-owned
  ('396705', 'd4e5f6a7-0001-4000-8000-000000000001')   -- production
ON CONFLICT (csi_id, tag_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 8. Reports (3 rows)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO reports (id, name, description, template, status, schedule, recipients, sections, selected_checks, created_by, created_at, updated_at) VALUES
  ('e5f6a7b8-0001-4000-8000-000000000001',
   'Daily Health Summary', 'Automated daily summary of all CSI health metrics',
   'standard', 'ACTIVE',
   '{"frequency":"daily","time":"08:00","timezone":"America/New_York"}'::jsonb,
   ARRAY['bruno.buger@citi.com', 'daniel.estevez@citi.com'],
   '[{"id":"sec-health-1","title":"Health Overview","kind":"manual","checkIds":["b2c3d4e5-0001-4000-8000-000000000001"]},{"id":"sec-failing-1","title":"Failing Checks","kind":"rule","rule":{"limit":10,"sort":"failing-first"}},{"id":"sec-trend-1","title":"7-Day Trend","kind":"manual","checkIds":["b2c3d4e5-0002-4000-8000-000000000001","b2c3d4e5-0003-4000-8000-000000000001"]}]'::jsonb,
   '["b2c3d4e5-0001-4000-8000-000000000001","b2c3d4e5-0002-4000-8000-000000000001","b2c3d4e5-0003-4000-8000-000000000001"]'::jsonb,
   'bruno.buger@citi.com', NOW() - INTERVAL '30 days', NOW()),

  ('e5f6a7b8-0001-4000-8000-000000000002',
   'Weekly SLA Report', 'Weekly service level agreement compliance report',
   'detailed', 'ACTIVE',
   '{"frequency":"weekly","dayOfWeek":1,"time":"09:00","timezone":"America/New_York"}'::jsonb,
   ARRAY['mike.chen@citi.com'],
   '[{"id":"sec-sla-1","title":"SLA Compliance","kind":"rule","rule":{"limit":20,"sort":"failing-first"}},{"id":"sec-uptime-1","title":"Uptime Chart","kind":"manual","checkIds":[]},{"id":"sec-incidents-1","title":"Incident List","kind":"rule","rule":{"limit":10,"sort":"failing-first"}}]'::jsonb,
   NULL,
   'mike.chen@citi.com', NOW() - INTERVAL '25 days', NOW()),

  ('e5f6a7b8-0001-4000-8000-000000000003',
   'Monthly Executive Brief', 'Executive summary of platform health and trends',
   'executive', 'ACTIVE',
   '{"frequency":"monthly","dayOfMonth":1,"time":"10:00","timezone":"America/New_York"}'::jsonb,
   ARRAY['mike.chen@citi.com', 'bruno.buger@citi.com'],
   '[{"id":"sec-exec-1","title":"Executive Summary","kind":"manual","checkIds":[]},{"id":"sec-kpi-1","title":"KPI Dashboard","kind":"rule","rule":{"limit":15,"sort":"failing-first"}},{"id":"sec-risk-1","title":"Risk Register","kind":"manual","checkIds":[]}]'::jsonb,
   NULL,
   'mike.chen@citi.com', NOW() - INTERVAL '20 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 9. Report Executions (9 rows — 3 per report)
-- ═══════════════════════════════════════════════════════════════

INSERT INTO report_executions (id, report_id, status, executed_at, recipient_count, checks_included, checks_failed, generation_duration_ms) VALUES
  -- Daily Health Summary
  ('f6a7b8c9-0001-4000-8000-000000000001', 'e5f6a7b8-0001-4000-8000-000000000001', 'SUCCESS', NOW() - INTERVAL '1 day',  2, 15, 4, 1250),
  ('f6a7b8c9-0001-4000-8000-000000000002', 'e5f6a7b8-0001-4000-8000-000000000001', 'SUCCESS', NOW() - INTERVAL '2 days', 2, 15, 3, 1180),
  ('f6a7b8c9-0001-4000-8000-000000000003', 'e5f6a7b8-0001-4000-8000-000000000001', 'PARTIAL', NOW() - INTERVAL '3 days', 2, 15, 5, 2340),
  -- Weekly SLA Report
  ('f6a7b8c9-0001-4000-8000-000000000004', 'e5f6a7b8-0001-4000-8000-000000000002', 'SUCCESS', NOW() - INTERVAL '7 days',  1, 15, 4, 3200),
  ('f6a7b8c9-0001-4000-8000-000000000005', 'e5f6a7b8-0001-4000-8000-000000000002', 'SUCCESS', NOW() - INTERVAL '14 days', 1, 15, 2, 2800),
  ('f6a7b8c9-0001-4000-8000-000000000006', 'e5f6a7b8-0001-4000-8000-000000000002', 'FAILED',  NOW() - INTERVAL '21 days', 1, 15, 6, 450),
  -- Monthly Executive Brief
  ('f6a7b8c9-0001-4000-8000-000000000007', 'e5f6a7b8-0001-4000-8000-000000000003', 'SUCCESS', NOW() - INTERVAL '1 day',   2, 15, 4, 4500),
  ('f6a7b8c9-0001-4000-8000-000000000008', 'e5f6a7b8-0001-4000-8000-000000000003', 'SUCCESS', NOW() - INTERVAL '30 days', 2, 15, 3, 4200),
  ('f6a7b8c9-0001-4000-8000-000000000009', 'e5f6a7b8-0001-4000-8000-000000000003', 'SUCCESS', NOW() - INTERVAL '60 days', 2, 15, 1, 3900)
ON CONFLICT DO NOTHING;

-- UI Studio intentionally has no sample tests or execution history. Production-like results must
-- come from a real accepted run. Remove rows created by older revisions of this repeatable seed.
DELETE FROM studio_dispatch_ledger
 WHERE execution_id::text LIKE 'c9d0e1f2-0001-4000-8000-%';
DELETE FROM ui_test_executions
 WHERE id::text LIKE 'c9d0e1f2-0001-4000-8000-%';
DELETE FROM ui_tests
 WHERE id::text LIKE 'b8c9d0e1-0001-4000-8000-%';

-- ═══════════════════════════════════════════════════════════════
-- 13. Execution Results (~450 rows via generate_series)
--     Inserted in started_at ASC order per check_id so the trigger
--     (update_check_status_from_execution) propagates the correct
--     final status to each check.
-- ═══════════════════════════════════════════════════════════════

-- Helper: weighted status arrays per check health profile
-- PASSING  checks: 90% SUCCESS, 5% WARNING, 5% TIMEOUT
-- FAILING  checks: 30% SUCCESS, 50% FAILURE, 10% WARNING, 10% TIMEOUT
-- WARNING  checks: 60% SUCCESS, 10% FAILURE, 25% WARNING, 5% TIMEOUT

-- 178672: PUT Shell Health (PASSING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0001-4000-8000-000000000001'::uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','WARNING',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','TIMEOUT','SUCCESS'])[1 + (n % 20)],
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '47 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '47 minutes') + INTERVAL '200 milliseconds' + (n % 5) * INTERVAL '100 milliseconds',
    150 + (n % 350),
    CASE WHEN (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','WARNING',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','TIMEOUT','SUCCESS'])[1 + (n % 20)] = 'SUCCESS'
         THEN '{"statusCode":200,"body":"OK"}'
         ELSE '{"statusCode":503,"body":"Service degraded"}'
    END,
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 178672: PUT Core Service (PASSING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0001-4000-8000-000000000002'::uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','WARNING','SUCCESS',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','TIMEOUT'])[1 + (n % 20)],
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '48 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '48 minutes') + INTERVAL '120 milliseconds' + (n % 3) * INTERVAL '80 milliseconds',
    100 + (n % 200),
    '{"statusCode":200}',
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 178672: Checks Module Health (FAILING — last result must be FAILURE)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0001-4000-8000-000000000003'::uuid,
    CASE WHEN n = 29 THEN 'FAILURE'  -- ensure last row is FAILURE for trigger
         ELSE (ARRAY['SUCCESS','FAILURE','FAILURE','FAILURE','FAILURE','SUCCESS','FAILURE','FAILURE','WARNING','TIMEOUT',
                      'FAILURE','FAILURE','SUCCESS','FAILURE','FAILURE','SUCCESS','FAILURE','FAILURE','WARNING','TIMEOUT'])[1 + (n % 20)]
    END,
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '49 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '49 minutes') + INTERVAL '800 milliseconds' + (n % 10) * INTERVAL '200 milliseconds',
    500 + (n % 9500),
    CASE WHEN n = 29 OR (ARRAY['SUCCESS','FAILURE','FAILURE','FAILURE','FAILURE','SUCCESS','FAILURE','FAILURE','WARNING','TIMEOUT',
                      'FAILURE','FAILURE','SUCCESS','FAILURE','FAILURE','SUCCESS','FAILURE','FAILURE','WARNING','TIMEOUT'])[1 + (n % 20)] != 'SUCCESS'
         THEN '{"statusCode":500,"body":"Internal Server Error: upstream payment validator timeout"}'
         ELSE '{"statusCode":200,"body":"OK"}'
    END,
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 178672: Comms Module Health (PASSING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0001-4000-8000-000000000004'::uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','WARNING'])[1 + (n % 20)],
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '50 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '50 minutes') + INTERVAL '15 milliseconds' + (n % 3) * INTERVAL '5 milliseconds',
    10 + (n % 40),
    '{"connected":true}',
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 178672: PUT Database Primary (PASSING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0001-4000-8000-000000000005'::uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','WARNING','SUCCESS'])[1 + (n % 20)],
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '51 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '51 minutes') + INTERVAL '8 milliseconds' + (n % 2) * INTERVAL '4 milliseconds',
    5 + (n % 20),
    '{"connected":true}',
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 285614: TSE Health Endpoint (PASSING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0002-4000-8000-000000000001'::uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','WARNING','SUCCESS',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','TIMEOUT'])[1 + (n % 20)],
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '47 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '47 minutes') + INTERVAL '180 milliseconds' + (n % 4) * INTERVAL '90 milliseconds',
    120 + (n % 400),
    '{"statusCode":200}',
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 285614: TSE Order Matching (FAILING — last result FAILURE)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0002-4000-8000-000000000002'::uuid,
    CASE WHEN n = 29 THEN 'FAILURE'
         ELSE (ARRAY['FAILURE','SUCCESS','FAILURE','FAILURE','FAILURE','SUCCESS','FAILURE','FAILURE','WARNING','TIMEOUT',
                      'FAILURE','SUCCESS','FAILURE','FAILURE','SUCCESS','FAILURE','FAILURE','FAILURE','WARNING','TIMEOUT'])[1 + (n % 20)]
    END,
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '48 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '48 minutes') + INTERVAL '2 seconds' + (n % 8) * INTERVAL '500 milliseconds',
    2000 + (n % 6000),
    CASE WHEN n = 29 THEN '{"statusCode":503,"body":"Order matching engine overloaded"}'
         ELSE '{"statusCode":200}'
    END,
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 285614: TSE Settlement Queue (FAILING — last result FAILURE)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0002-4000-8000-000000000003'::uuid,
    CASE WHEN n = 29 THEN 'FAILURE'
         ELSE (ARRAY['FAILURE','FAILURE','SUCCESS','FAILURE','FAILURE','FAILURE','SUCCESS','FAILURE','WARNING','TIMEOUT',
                      'FAILURE','FAILURE','FAILURE','SUCCESS','FAILURE','FAILURE','FAILURE','SUCCESS','WARNING','TIMEOUT'])[1 + (n % 20)]
    END,
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '49 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '49 minutes') + INTERVAL '1 second' + (n % 5) * INTERVAL '300 milliseconds',
    1000 + (n % 4000),
    CASE WHEN n = 29 THEN '{"statusCode":500,"body":"Settlement queue backlog: 12,847 pending"}'
         ELSE '{"statusCode":200}'
    END,
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 285614: TSE Risk Calculator (WARNING — last result WARNING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0002-4000-8000-000000000004'::uuid,
    CASE WHEN n = 29 THEN 'WARNING'
         ELSE (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','WARNING','WARNING','WARNING','SUCCESS',
                      'SUCCESS','SUCCESS','WARNING','WARNING','WARNING','SUCCESS','SUCCESS','SUCCESS','FAILURE','WARNING'])[1 + (n % 20)]
    END,
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '50 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '50 minutes') + INTERVAL '3 seconds' + (n % 7) * INTERVAL '1 second',
    3000 + (n % 7000),
    CASE WHEN n = 29 THEN '{"statusCode":200,"body":"OK","warning":"Response time 4.2s exceeds 3s threshold"}'
         ELSE '{"statusCode":200}'
    END,
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 285614: TSE Database Primary (PASSING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0002-4000-8000-000000000005'::uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','WARNING'])[1 + (n % 20)],
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '51 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '51 minutes') + INTERVAL '12 milliseconds' + (n % 3) * INTERVAL '6 milliseconds',
    8 + (n % 30),
    '{"connected":true}',
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 285614: TSE Message Broker (FAILING — last result FAILURE)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0002-4000-8000-000000000006'::uuid,
    CASE WHEN n = 29 THEN 'FAILURE'
         ELSE (ARRAY['FAILURE','FAILURE','FAILURE','FAILURE','FAILURE','FAILURE','FAILURE','FAILURE','FAILURE','FAILURE',
                      'SUCCESS','FAILURE','FAILURE','FAILURE','FAILURE','FAILURE','FAILURE','FAILURE','FAILURE','TIMEOUT'])[1 + (n % 20)]
    END,
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '52 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '52 minutes') + INTERVAL '5 seconds',
    5000,
    '{"error":"Connection refused: tse-mq.internal.citi.com:5672"}',
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 396705: DevPortal Health (PASSING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0003-4000-8000-000000000001'::uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS'])[1 + (n % 20)],
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '47 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '47 minutes') + INTERVAL '100 milliseconds' + (n % 2) * INTERVAL '50 milliseconds',
    80 + (n % 120),
    '{"statusCode":200,"body":"OK"}',
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 396705: DevPortal API Gateway (PASSING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0003-4000-8000-000000000002'::uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS'])[1 + (n % 20)],
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '48 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '48 minutes') + INTERVAL '90 milliseconds' + (n % 3) * INTERVAL '30 milliseconds',
    60 + (n % 150),
    '{"statusCode":200}',
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 396705: DevPortal CDN (PASSING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0003-4000-8000-000000000003'::uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS'])[1 + (n % 20)],
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '49 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '49 minutes') + INTERVAL '25 milliseconds' + (n % 2) * INTERVAL '15 milliseconds',
    20 + (n % 40),
    '{"statusCode":200}',
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- 396705: DevPortal Database (PASSING)
INSERT INTO execution_results (id, check_id, status, started_at, ended_at, duration_ms, output, metadata)
SELECT
    gen_random_uuid(),
    'b2c3d4e5-0003-4000-8000-000000000004'::uuid,
    (ARRAY['SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS',
           'SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS','SUCCESS'])[1 + (n % 20)],
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '50 minutes'),
    NOW() - INTERVAL '30 days' + ((n % 28) * INTERVAL '1 day') + (n * INTERVAL '50 minutes') + INTERVAL '10 milliseconds' + (n % 2) * INTERVAL '5 milliseconds',
    8 + (n % 25),
    '{"connected":true}',
    '{}'::jsonb
FROM generate_series(0, 29) AS s(n)
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════
-- 14. Refresh materialized view
-- ═══════════════════════════════════════════════════════════════

REFRESH MATERIALIZED VIEW csi_metrics_current;
