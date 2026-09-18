import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [inputPath, resultPath] = process.argv.slice(2);
if (!inputPath || !resultPath) {
  throw new Error('Usage: run-studio-test.mjs <input.json> <result.json>');
}

const input = JSON.parse(await readFile(inputPath, 'utf8'));
const artifactsDir = path.dirname(resultPath);
await mkdir(artifactsDir, { recursive: true });

const now = () => new Date().toISOString();
const logs = [];
const stepResults = [];
const screenshots = [];
const log = (type, message) => logs.push({ timestamp: now(), type, message });

function quotedValue(step, expression) {
  const match = step.match(expression);
  if (!match) throw new Error(`Could not understand step: ${step}`);
  return match[1];
}

const chromeExecutable = process.env.STUDIO_CHROME_EXECUTABLE || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
let browser;
let context;
try {
  log('info', 'Launching local Chrome with video recording enabled');
  browser = await chromium.launch({ headless: true, executablePath: chromeExecutable });
  context = await browser.newContext({
    viewport: input.viewport ?? { width: 1440, height: 900 },
    recordVideo: { dir: artifactsDir, size: input.viewport ?? { width: 1440, height: 900 } },
  });
  const page = await context.newPage();

  for (const [index, originalText] of input.steps.entries()) {
    const step = originalText.trim();
    const lower = step.toLowerCase();
    log('info', `Step ${index + 1}: ${step}`);
    try {
      if (lower.startsWith('go to ') || lower.startsWith('navigate to ')) {
        const url = step.replace(/^go to\s+|^navigate to\s+/i, '').replace(/^"|"$/g, '');
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } else if (lower.startsWith('search for ')) {
        const term = quotedValue(step, /search for\s+"(.+?)"/i);
        const search = page.locator('textarea[name="q"], input[name="q"]').first();
        await search.waitFor({ state: 'visible', timeout: 15000 });
        await search.fill(term);
        await search.press('Enter');
        await page.waitForLoadState('domcontentloaded');
      } else if (lower.startsWith('check that ') || lower.startsWith('check if ')) {
        const expected = step.replace(/^check (?:that|if)\s+/i, '').replace(/^"|"$/g, '');
        await page.getByText(expected, { exact: false }).first().waitFor({ state: 'visible', timeout: 15000 });
      } else {
        throw new Error(`Unsupported local runner step: ${step}`);
      }
      const screenshot = `step-${index + 1}.png`;
      await page.screenshot({ path: path.join(artifactsDir, screenshot), fullPage: false });
      screenshots.push(screenshot);
      stepResults.push({ stepIndex: index, status: 'PASS' });
      log('success', `Step ${index + 1} passed`);
    } catch (error) {
      stepResults.push({ stepIndex: index, status: 'FAILED' });
      log('error', `Step ${index + 1} failed: ${error.message}`);
      throw error;
    }
  }
  await context.close();
  await browser.close();
  await writeFile(resultPath, JSON.stringify({ status: 'COMPLETED', logs, stepResults, screenshots }, null, 2));
} catch (error) {
  if (context) await context.close().catch(() => {});
  if (browser) await browser.close().catch(() => {});
  log('error', error.message);
  await writeFile(resultPath, JSON.stringify({ status: 'FAILED', logs, stepResults, screenshots, error: error.message }, null, 2));
  process.exitCode = 1;
}
