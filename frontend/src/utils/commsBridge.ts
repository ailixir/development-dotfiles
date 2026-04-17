import type { AttentionItem } from '@/types/dashboard/dashboardTypes';

export interface CommsTemplateState {
  templateTitle: string;
  templateContent: string;
  templateSubject?: string;
}

export function createCommsTemplateFromCheck(item: AttentionItem): CommsTemplateState {
  const status = (item.status || '').toUpperCase();
  const statusDisplay = status === 'FAILING' ? '🔴 FAILING' : status === 'WARNING' ? '🟠 WARNING' : status ? `🟢 ${status}` : 'UNKNOWN';
  const palette = {
    primary: '#0056C7',
    primaryDark: '#003C8F',
    bgLight: '#F5F9FF',
    border: '#D8E2F1',
    tableHeader: '#EEF4FF',
    textSecondary: '#475569',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
  } as const;
  const statusChip = status === 'FAILING' ? palette.error : status === 'WARNING' ? palette.warning : palette.success;

  const templateTitle = 'Check Status Update';
  const templateSubject = `Check Status: ${item.name} • ${item.csiName}`;

  const templateContent = `
    <h2>Check Status Update</h2>
    <p><strong>Status:</strong> ${statusDisplay}</p>
    <p><strong>Check:</strong> ${escapeHtml(item.name)}</p>
    <p><strong>CSI:</strong> ${escapeHtml(item.csiName)} (${escapeHtml(item.csiId)})</p>
    <p><strong>Since:</strong> ${new Date(item.since).toLocaleString()}</p>
    ${item.reason ? `<blockquote><strong>Reason:</strong> ${escapeHtml(item.reason)}</blockquote>` : ''}
    <p><a href="/checks/details/${encodeURIComponent(item.id)}" target="_blank" rel="noopener">View in Checks →</a></p>

    <table>
      <tr>
        <th>Field</th>
        <th>Value</th>
      </tr>
      <tr>
        <td>Check ID</td>
        <td>${escapeHtml(item.id)}</td>
      </tr>
      <tr>
        <td>CSI ID</td>
        <td>${escapeHtml(item.csiId)}</td>
      </tr>
      <tr>
        <td>Status</td>
        <td>${statusDisplay}</td>
      </tr>
    </table>

    <hr />
    <h3>Status Summary</h3>
    <p>Add a short status summary and current impact.</p>

    <h3>Actions & Owners</h3>
    <ul>
      <li>Action 1 — Owner</li>
      <li>Action 2 — Owner</li>
    </ul>
  `;

  return { templateTitle, templateContent, templateSubject };
}

// Create a Comms context payload from a full Check entity (used on Check Details page)
export function createCommsTemplateFromCheckDetails(check: {
  id: string;
  name: string;
  status?: string;
  csiId?: string;
  csiName?: string;
  type?: string;
  tags?: string[];
  configuration?: Record<string, unknown>;
}): CommsTemplateState {
  const status = (check.status || '').toUpperCase();
  const statusDisplay = status === 'FAILING' ? '🔴 FAILING' : status === 'WARNING' ? '🟠 WARNING' : status ? `🟢 ${status}` : 'UNKNOWN';
  const palette = {
    primary: '#0056C7',
    primaryDark: '#003C8F',
    bgLight: '#F5F9FF',
    border: '#D8E2F1',
    tableHeader: '#EEF4FF',
    textSecondary: '#475569',
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
  } as const;
  const statusChip = status === 'FAILING' ? palette.error : status === 'WARNING' ? palette.warning : palette.success;

  const templateTitle = 'Check Status Update';
  const templateSubject = `Check Status: ${check.name} • ${check.csiName || check.csiId || ''}`.trim();

  const configRows: string[] = [];
  if (check.type === 'HTTP') {
    const cfg = check.configuration as { method?: string; url?: string; expectedStatus?: number; timeout?: number } | undefined;
    configRows.push(`<li><strong>Method:</strong> ${escapeHtml(String(cfg?.method || 'GET'))}</li>`);
    if (cfg?.url) configRows.push(`<li><strong>URL:</strong> ${escapeHtml(cfg.url)}</li>`);
    if (typeof cfg?.expectedStatus !== 'undefined') configRows.push(`<li><strong>Expected Status:</strong> ${escapeHtml(String(cfg.expectedStatus))}</li>`);
    if (typeof cfg?.timeout !== 'undefined') configRows.push(`<li><strong>Timeout:</strong> ${escapeHtml(String(cfg.timeout))} ms</li>`);
  } else if (check.type === 'TCP') {
    const cfg = check.configuration as { host?: string; port?: number } | undefined;
    if (cfg?.host) configRows.push(`<li><strong>Host:</strong> ${escapeHtml(cfg.host)}</li>`);
    if (typeof cfg?.port !== 'undefined') configRows.push(`<li><strong>Port:</strong> ${escapeHtml(String(cfg.port))}</li>`);
  }

  const tagsHtml = (check.tags && check.tags.length)
    ? `<p style="margin:6px 0 0 0;color:#475569"><strong>Tags:</strong> ${check.tags.map(t => escapeHtml(t)).join(', ')}</p>`
    : '';

  const templateContent = `
    <h2>Check Status Update</h2>
    <p><strong>Status:</strong> ${statusDisplay}</p>

    <table>
      <tr>
        <th>Check</th>
        <td>${escapeHtml(check.name)}</td>
      </tr>
      <tr>
        <th>CSI</th>
        <td>${escapeHtml(check.csiName || '')} ${check.csiId ? '(' + escapeHtml(check.csiId) + ')' : ''}</td>
      </tr>
      <tr>
        <th>Status</th>
        <td>${escapeHtml(statusDisplay)}</td>
      </tr>
      <tr>
        <th>Type</th>
        <td>${escapeHtml(check.type || '—')}</td>
      </tr>
      <tr>
        <th>Checks Link</th>
        <td><a href="/checks/details/${encodeURIComponent(check.id)}" target="_blank" rel="noopener">Open in Checks →</a></td>
      </tr>
    </table>
    ${tagsHtml}

    ${configRows.length ? `
      <h3>Configuration Snapshot</h3>
      <ul>${configRows.join('')}</ul>
    ` : ''}

    <h3>Impact Summary</h3>
    <p>Briefly describe affected services, customers, and scope.</p>

    <h3>Root Cause (if known)</h3>
    <p>Summarize the cause or suspected cause.</p>

    <h3>Resolution / Mitigation</h3>
    <p>Describe actions taken and current status.</p>

    <h3>Next Steps & Owners</h3>
    <ul>
      <li>Action 1 — Owner</li>
      <li>Action 2 — Owner</li>
    </ul>
  `;

  return { templateTitle, templateContent, templateSubject };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

