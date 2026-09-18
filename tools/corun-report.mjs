/**
 * Reads the co-run's JUnit XML and decides whether the co-run happened.
 *
 * Why this is not `echo $?`. Gradle prints a test tally only when something fails, and its exit
 * code cannot distinguish "every leg passed" from "the class never executed" — an
 * environment-conditional test that quietly declined to run exits 0, and a harness whose whole
 * purpose is to be the first thing that runs two components together must never be able to report
 * success by declining to run. The executed count is therefore asserted here, from the XML, and a
 * run in which every leg was skipped is a failure with its own message.
 *
 * Usage: node tools/corun-report.mjs <path-to-TEST-*.xml>
 * Exit:  0 green · 1 red, empty or skipped · 2 the file is not there
 */
import { readFileSync, existsSync } from 'node:fs';

const CYAN = '[0;36m';
const RED = '[0;31m';
const OFF = '[0m';

const say = (message) => console.log(`${CYAN}[co-run]${OFF} ${message}`);
const fail = (message) => console.error(`${RED}[co-run]${OFF} ${message}`);

const path = process.argv[2];
if (!path || !existsSync(path)) {
  fail(`no JUnit XML at ${path} — the co-run class never ran at all.`);
  process.exit(2);
}

const xml = readFileSync(path, 'utf8');
const suite = xml.match(/<testsuite\b[^>]*>/)?.[0] ?? '';
const count = (name) => Number(suite.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1] ?? '0');

const tests = count('tests');
const failures = count('failures');
const errors = count('errors');
const skipped = count('skipped');

console.log('');
say(`legs executed: ${tests} · failures: ${failures} · errors: ${errors} · skipped: ${skipped}`);

if (tests === 0 || tests === skipped) {
  fail('the co-run executed nothing. An empty run is not a green run.');
  process.exit(1);
}

const decode = (value) =>
  value
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

if (failures > 0 || errors > 0) {
  console.log('');
  fail('the co-run is RED. Each failing leg names the component that refused and what it refused:');
  for (const block of xml.split('<testcase ').slice(1)) {
    const body = block.split('</testcase>')[0];
    if (!/<(failure|error)\b/.test(body)) continue;
    const name = block.match(/name="([^"]+)"/)?.[1] ?? '(unnamed leg)';
    const message = decode(body.match(/<(?:failure|error)[^>]*message="([^"]*)"/)?.[1] ?? '');
    console.log('');
    console.log(`  ── ${name}`);
    for (const line of message.split('\n')) console.log(`     ${line}`);
  }
  console.log('');
  process.exit(1);
}

say('the co-run is GREEN: the API and the studio-runner ran together and agreed on every leg.');
process.exit(0);
