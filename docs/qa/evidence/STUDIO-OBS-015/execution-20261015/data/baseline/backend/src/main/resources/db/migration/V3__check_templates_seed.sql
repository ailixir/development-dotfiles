-- V3__check_templates_seed.sql
-- Story 3.13: Create check_templates table and seed with default templates.

CREATE TABLE IF NOT EXISTS check_templates (
    id VARCHAR(100) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    type VARCHAR(50) NOT NULL,
    difficulty VARCHAR(20) NOT NULL DEFAULT 'easy',
    tags JSONB DEFAULT '[]',
    estimated_setup_minutes INT DEFAULT 5,
    default_configuration JSONB DEFAULT '{}'
);

INSERT INTO check_templates (id, title, description, type, difficulty, tags, estimated_setup_minutes, default_configuration) VALUES
('tpl-http-latency-200', 'HTTP Latency & 200 OK', 'Monitor endpoint availability and response time', 'HTTP', 'easy', '["http","latency","availability"]', 5, '{"url":"","method":"GET","expectedStatus":200,"timeoutMs":5000}'),
('tpl-tcp-port-availability', 'TCP Port Availability', 'Verify TCP port is accepting connections', 'TCP', 'easy', '["tcp","port","connectivity"]', 3, '{"host":"","port":0,"timeoutMs":3000}'),
('tpl-splunk-error-threshold', 'Splunk Error Count Threshold', 'Alert when error count exceeds threshold in Splunk', 'SPLUNK', 'medium', '["splunk","errors","threshold"]', 10, '{"query":"index=main level=ERROR","timeRange":"-15m","threshold":{"operator":"greater_than","value":100}}'),
('tpl-grafana-metric-threshold', 'Grafana Metric Threshold', 'Monitor a Grafana metric against a threshold', 'GRAFANA', 'medium', '["grafana","metric","threshold"]', 10, '{"datasource":"","query":"","threshold":{"operator":"greater_than","value":0}}'),
('tpl-itrs-sampler-ok', 'ITRS Sampler OK', 'Verify ITRS sampler is reporting OK status', 'ITRS', 'medium', '["itrs","sampler","status"]', 8, '{"gateway":"","sampler":"","dataitem":"status","expectedValue":"OK"}'),
('tpl-appdynamics-health-rule', 'AppDynamics Health Rule', 'Monitor AppDynamics health rule violations', 'APPDYNAMICS', 'medium', '["appdynamics","health","rule"]', 10, '{"application":"","healthRule":"","tier":""}'),
('tpl-ui-login-flow', 'UI Login Flow Test', 'Automated browser test for login workflow', 'UI_TEST', 'advanced', '["ui","login","browser","automation"]', 15, '{"browser":"chrome","viewport":{"width":1920,"height":1080},"steps":["Go to {LOGIN_URL}","Type {USERNAME} in User ID field","Type {PASSWORD} in Password field","Click Sign On","Check that URL contains dashboard"]}');
