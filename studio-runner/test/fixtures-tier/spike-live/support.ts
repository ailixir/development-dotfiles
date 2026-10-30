/**
 * SPK-07 live-block support (fixtures tier): the Chromium launcher and page opener the live blocks use. They run only with
 * SPK07_LIVE=1 (Chromium; the HN cases also need the network, which the loopback-only fixtures tier does not otherwise use).
 */
import { createRequire } from 'node:module';

import type { Browser, Page } from '../../evaluation/grounding-b-support.js';

export async function launch(): Promise<Browser> {
  const require = createRequire(new URL('../../../package.json', import.meta.url));
  const { chromium } = require('playwright') as { chromium: { launch(o?: object): Promise<Browser> } };
  return chromium.launch({ headless: true });
}

export async function openPage(browser: Browser, source: { html: string } | { url: string }, viewport = { width: 1280, height: 720 }): Promise<Page> {
  const page = await (await browser.newContext({ viewport })).newPage();
  if ('html' in source) await page.setContent(source.html); else await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  return page;
}

