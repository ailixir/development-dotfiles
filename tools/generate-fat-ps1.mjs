#!/usr/bin/env node
/*
  Generates a paginated, self-contained PowerShell bundle that recreates the
  project from embedded file contents. It scans the configured roots and
  additional files, reads content, and emits a small launcher plus payload parts.

  Usage:
    node tools/generate-fat-ps1.mjs

  Output:
    ./put-checks-fat.ps1
    ./put-checks-fat.parts/*.ps1
*/

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const PROJECT_NAME = '178672.put.put-checks';
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const OUTPUT_SCRIPT = 'put-checks-fat.ps1';
const OUTPUT_PARTS_DIR = 'put-checks-fat.parts';
const MAX_GENERATED_LINES = 8000;
const BASE64_LINE_LENGTH = 120;
const PROJECT_ROOTS = ['backend'];
const ADDITIONAL_FILES = [
  'package.json',
];
const EXCLUDE_PATTERNS = [
  /(^|\/)node_modules(\/|$)/i,
  /(^|\/)\.gradle(\/|$)/i,
  /(^|\/)\.cache(\/|$)/i,
  /(^|\/)\.vite(\/|$)/i,
  /(^|\/)(build|dist|coverage|out|target|tmp|temp)(\/|$)/i,
  /(^|\/)(playwright-report|test-results)(\/|$)/i,
  /(^|\/)\.DS_Store$/i,
  /\.log$/i,
  /\.(tmp|temp|swp|bak)$/i,
  /~$/i,
];

function isExcluded(rel) {
  return EXCLUDE_PATTERNS.some((rx) => rx.test(rel));
}

async function statSafe(p) {
  try {
    return await fs.promises.stat(p);
  } catch {
    return null;
  }
}

async function readDirRecursive(rootDir, baseRel = '') {
  const abs = path.join(rootDir, baseRel);
  const entries = await fs.promises.readdir(abs, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const rel = path.posix.join(baseRel.split(path.sep).join(path.posix.sep), e.name);
    const relUnix = rel.replace(/\\/g, '/');
    if (isExcluded(relUnix)) continue;
    const absEntry = path.join(rootDir, rel);
    if (e.isDirectory()) {
      const sub = await readDirRecursive(rootDir, rel);
      files.push(...sub);
    } else if (e.isFile()) {
      files.push({
        absolutePath: absEntry,
        relativePath: path.posix.join(path.basename(rootDir), relUnix),
      });
    }
  }
  return files;
}

function sha256Buffer(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function escapeSingleQuotes(s) {
  return s.replace(/'/g, "''");
}

function toPowerShellBase64HereStringLines(contentBase64) {
  // Base64 keeps payloads compact, byte-exact, and safe for text-only transfer.
  const chunks = contentBase64.match(new RegExp(`.{1,${BASE64_LINE_LENGTH}}`, 'g')) ?? [''];
  return [`@'`, ...chunks, `'@`];
}

function buildFileEntryLines(f, index) {
  const hereStringLines = toPowerShellBase64HereStringLines(f.contentBase64);
  const [hereStringStart, ...hereStringRest] = hereStringLines;

  return [
    '',
    `# File ${index}: ${f.relativePath}`,
    `$Files += [pscustomobject]@{`,
    `  RelativePath = '${escapeSingleQuotes(f.relativePath)}'`,
    `  SizeBytes    = ${f.size}`,
    `  Sha256       = '${f.hash}'`,
    `  ContentBase64 = ${hereStringStart}`,
    ...hereStringRest,
    `}`,
  ];
}

function buildPartHeader(partNumber) {
  return [
    `<#`,
    `  Generated payload page ${partNumber} for ${OUTPUT_SCRIPT}.`,
    `  Dot-source from ${OUTPUT_SCRIPT}; do not run directly.`,
    `#>`,
    '',
  ];
}

function paginateFileEntries(fileEntries) {
  const pages = [];
  let currentPage = buildPartHeader(1);

  fileEntries.forEach((f, idx) => {
    const entryLines = buildFileEntryLines(f, idx + 1);
    const freshPageLineBudget = MAX_GENERATED_LINES - buildPartHeader(pages.length + 1).length;

    if (entryLines.length > freshPageLineBudget) {
      throw new Error(
        `${f.relativePath} needs ${entryLines.length} generated lines, exceeding the ${MAX_GENERATED_LINES}-line page limit.`
      );
    }

    if (currentPage.length + entryLines.length > MAX_GENERATED_LINES) {
      pages.push(currentPage);
      currentPage = buildPartHeader(pages.length + 1);
    }

    currentPage.push(...entryLines);
  });

  if (currentPage.length > buildPartHeader(pages.length + 1).length || pages.length === 0) {
    pages.push(currentPage);
  }

  return pages;
}

function assertLineLimit(label, lines) {
  if (lines.length > MAX_GENERATED_LINES) {
    throw new Error(`${label} has ${lines.length} lines, exceeding the ${MAX_GENERATED_LINES}-line limit.`);
  }
}

async function writeGeneratedOutput(mainLines, fileEntries) {
  const outPath = path.join(REPO_ROOT, OUTPUT_SCRIPT);
  const partsDir = path.join(REPO_ROOT, OUTPUT_PARTS_DIR);
  const pages = paginateFileEntries(fileEntries);
  const partNameWidth = Math.max(3, String(pages.length).length);

  assertLineLimit(OUTPUT_SCRIPT, mainLines);
  pages.forEach((page, idx) => assertLineLimit(`part ${idx + 1}`, page));

  await fs.promises.rm(partsDir, { recursive: true, force: true });
  await fs.promises.mkdir(partsDir, { recursive: true });
  await fs.promises.writeFile(outPath, mainLines.join('\n'), 'utf8');

  for (let i = 0; i < pages.length; i += 1) {
    const partNumber = String(i + 1).padStart(partNameWidth, '0');
    const partPath = path.join(partsDir, `put-checks-fat.part${partNumber}.ps1`);
    await fs.promises.writeFile(partPath, pages[i].join('\n'), 'utf8');
  }

  return { outPath, partCount: pages.length };
}

async function main() {
  // Gather files from roots
  const gathered = [];
  for (const root of PROJECT_ROOTS) {
    const absRoot = path.join(REPO_ROOT, root);
    const st = await statSafe(absRoot);
    if (!st || !st.isDirectory()) continue;
    const list = await readDirRecursive(absRoot);
    // relativePath should be prefixed with the root directory name already
    gathered.push(...list);
  }

  // Add additional root-level files
  for (const rel of ADDITIONAL_FILES) {
    const abs = path.join(REPO_ROOT, rel);
    const st = await statSafe(abs);
    if (!st || !st.isFile()) continue;
    if (isExcluded(rel)) continue;
    gathered.push({ absolutePath: abs, relativePath: rel.replace(/\\/g, '/') });
  }

  // Deduplicate by relativePath
  const seen = new Set();
  const files = [];
  for (const f of gathered) {
    if (seen.has(f.relativePath)) continue;
    seen.add(f.relativePath);
    files.push(f);
  }

  // Sort for deterministic output
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  // Read all contents
  const fileEntries = [];
  for (const f of files) {
    const contentBuffer = await fs.promises.readFile(f.absolutePath).catch(() => Buffer.alloc(0));
    const size = contentBuffer.byteLength;
    const hash = sha256Buffer(contentBuffer);
    const contentBase64 = contentBuffer.toString('base64');
    fileEntries.push({ ...f, contentBase64, size, hash });
  }

  // Compute directories
  const dirSet = new Set();
  for (const f of fileEntries) {
    const rel = f.relativePath;
    const parts = rel.split('/');
    parts.pop(); // remove file name
    let accum = '';
    for (const p of parts) {
      accum = accum ? `${accum}/${p}` : p;
      dirSet.add(accum);
    }
  }
  const directories = Array.from(dirSet).sort();

  const now = new Date();
  const generatedOn = now.toISOString();
  const psOut = [];

  // Header
  psOut.push(`<#`);
  psOut.push(`.SYNOPSIS`);
  psOut.push(`    Auto-generated STANDALONE deployment script for ${PROJECT_NAME}`);
  psOut.push('');
  psOut.push(`.DESCRIPTION`);
  psOut.push(`    This script recreates the complete project structure and files.`);
  psOut.push(`    ALL FILE CONTENTS ARE EMBEDDED WITHIN THIS SCRIPT.`);
  psOut.push(`    No external dependencies required.`);
  psOut.push('');
  psOut.push(`    Generated on: ${generatedOn}`);
  psOut.push(`    Source: ${REPO_ROOT}`);
  psOut.push(`    Total Files: ${fileEntries.length}`);
  psOut.push('');
  psOut.push(`.NOTES`);
  psOut.push(`    Run this script in an empty directory where you want the project created.`);
  psOut.push(`    Requires PowerShell 5.0 or higher.`);
  psOut.push(`    This is a completely self-contained script with all file contents embedded.`);
  psOut.push(`#>`);
  psOut.push('');
  psOut.push(`$ErrorActionPreference = 'Stop'`);
  psOut.push('');
  psOut.push(`# === CONFIGURATION ===`);
  psOut.push(`$ProjectName = '${escapeSingleQuotes(PROJECT_NAME)}'`);
  psOut.push(`$ExpectedTotalFiles = ${fileEntries.length}`);
  psOut.push(`$ExpectedTotalDirectories = ${directories.length}`);
  psOut.push(`$IsWindowsHost = $false`);
  psOut.push(`$isWindowsVariable = Get-Variable -Name IsWindows -ErrorAction SilentlyContinue`);
  psOut.push(`if ($isWindowsVariable) {`);
  psOut.push(`  $IsWindowsHost = [bool]$isWindowsVariable.Value`);
  psOut.push(`} else {`);
  psOut.push(`  $IsWindowsHost = [System.Environment]::OSVersion.Platform -eq [System.PlatformID]::Win32NT`);
  psOut.push(`}`);
  psOut.push('');
  psOut.push(`# Auto-elevate if on Windows and not running as admin`);
  psOut.push(`try {`);
  psOut.push(`  if ($IsWindowsHost) {`);
  psOut.push(`    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()`);
  psOut.push(`    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)`);
  psOut.push(`    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {`);
  psOut.push(`      Write-Host '[i] Not running as Administrator. Attempting to relaunch with elevation...' -ForegroundColor Yellow`);
  psOut.push(`      $psi = New-Object System.Diagnostics.ProcessStartInfo 'powershell'`);
  psOut.push(`      $psi.Arguments = '-ExecutionPolicy Bypass -File "' + $MyInvocation.MyCommand.Definition + '"'`);
  psOut.push(`      $psi.Verb = 'runas'`);
  psOut.push(`      [Diagnostics.Process]::Start($psi) | Out-Null`);
  psOut.push(`      exit`);
  psOut.push(`    }`);
  psOut.push(`  }`);
  psOut.push(`} catch {`);
  psOut.push(`  Write-Host '[w] Elevation step skipped or failed: ' + $_.Exception.Message -ForegroundColor Yellow`);
  psOut.push(`}`);
  psOut.push('');
  psOut.push(`# Set execution policy for this process only`);
  psOut.push(`try { Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass -Force } catch {}`);
  psOut.push('');
  psOut.push(`# === INVENTORY (as comments) ===`);
  psOut.push(`<#`);
  psOut.push(`Directories (${directories.length}):`);
  for (const d of directories) psOut.push(`  - ${d}`);
  psOut.push('');
  psOut.push(`Files (${fileEntries.length}):`);
  for (const f of fileEntries) psOut.push(`  - ${f.relativePath}`);
  psOut.push(`#>`);
  psOut.push('');
  psOut.push(`# === EMBEDDED FILE CONTENTS SECTION ===`);
  psOut.push(`$Files = @()`);
  psOut.push(`$PartsRoot = Join-Path $PSScriptRoot '${escapeSingleQuotes(OUTPUT_PARTS_DIR)}'`);
  psOut.push(`if (-not (Test-Path -LiteralPath $PartsRoot -PathType Container)) {`);
  psOut.push(`  throw "Missing payload directory: $PartsRoot"`);
  psOut.push(`}`);
  psOut.push(`$PartScripts = Get-ChildItem -LiteralPath $PartsRoot -Filter '*.ps1' | Sort-Object Name`);
  psOut.push(`if ($PartScripts.Count -eq 0) { throw "No payload part scripts found in $PartsRoot" }`);
  psOut.push(`foreach ($part in $PartScripts) {`);
  psOut.push(`  Write-Host ('[i] Loading payload page: ' + $part.Name)`);
  psOut.push(`  . $part.FullName`);
  psOut.push(`}`);
  psOut.push(`if ($Files.Count -ne $ExpectedTotalFiles) {`);
  psOut.push(`  throw "Loaded $($Files.Count) files, expected $ExpectedTotalFiles. Payload pages may be missing."`);
  psOut.push(`}`);
  psOut.push(`function Get-EmbeddedBytes {`);
  psOut.push(`  param([AllowEmptyString()][string]$Value)`);
  psOut.push(`  $clean = $Value -replace '\\s+', ''`);
  psOut.push(`  return ,([System.Convert]::FromBase64String($clean))`);
  psOut.push(`}`);
  psOut.push('');
  psOut.push(`# === DIRECTORY AND FILE CREATION SECTION ===`);
  psOut.push(`try {`);
  psOut.push(`  $Stopwatch = [System.Diagnostics.Stopwatch]::StartNew()`);
  psOut.push(`  $DestinationRoot = (Get-Location).Path`);
  psOut.push(`  $ProjectRoot = Join-Path $DestinationRoot $ProjectName`);
  psOut.push(`  Write-Host ('[i] Creating project root: ' + $ProjectRoot)`);
  psOut.push(`  if (-not (Test-Path -Path $ProjectRoot)) { New-Item -ItemType Directory -Path $ProjectRoot -Force | Out-Null }`);
  psOut.push('');
  psOut.push(`  # Create directories first`);
  psOut.push(`  $dirCount = 0`);
  psOut.push(`  foreach ($d in @(${directories.map(d=>"'"+escapeSingleQuotes(d)+"'").join(', ')})) {`);
  psOut.push(`    $fullDir = Join-Path $ProjectRoot $d`);
  psOut.push(`    if (-not (Test-Path -Path $fullDir)) { New-Item -ItemType Directory -Path $fullDir -Force | Out-Null }`);
  psOut.push(`    $dirCount++`);
  psOut.push(`    Write-Host ("[dir] Created/ensured: $dirCount of $ExpectedTotalDirectories :: " + $fullDir)`);
  psOut.push(`  }`);
  psOut.push('');
  psOut.push(`  # Write files`);
  psOut.push(`  $i = 0`);
  psOut.push(`  foreach ($f in $Files) {`);
  psOut.push(`    $i++`);
  psOut.push(`    $target = Join-Path $ProjectRoot $f.RelativePath`);
  psOut.push(`    $parent = Split-Path -Path $target -Parent`);
  psOut.push(`    if (-not (Test-Path -Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }`);
  psOut.push(`    try {`);
  psOut.push(`      $bytes = Get-EmbeddedBytes $f.ContentBase64`);
  psOut.push(`      [System.IO.File]::WriteAllBytes($target, $bytes)`);
  psOut.push(`      Write-Host ("[file] Created file $i of $ExpectedTotalFiles :: " + $f.RelativePath)`);
  psOut.push(`    } catch {`);
  psOut.push(`      Write-Host ("[error] Failed to create: " + $f.RelativePath + " :: " + $_.Exception.Message) -ForegroundColor Red`);
  psOut.push(`    }`);
  psOut.push(`  }`);
  psOut.push('');
  psOut.push(`  $Stopwatch.Stop()`);
  psOut.push(`  Write-Host ("[i] Creation completed in " + [math]::Round($Stopwatch.Elapsed.TotalSeconds,2) + "s") -ForegroundColor Green`);
  psOut.push('');
  psOut.push(`  # === FINAL VALIDATION ===`);
  psOut.push(`  $missing = @()`);
  psOut.push(`  $contentDiff = @()`);
  psOut.push(`  $sha256 = [System.Security.Cryptography.SHA256]::Create()`);
  psOut.push(`  foreach ($f in $Files) {`);
  psOut.push(`    $target = Join-Path $ProjectRoot $f.RelativePath`);
  psOut.push(`    if (-not (Test-Path -Path $target)) { $missing += $f.RelativePath; continue }`);
  psOut.push(`    try {`);
  psOut.push(`      $diskBytes = [System.IO.File]::ReadAllBytes($target)`);
  psOut.push(`      $diskHash = [System.BitConverter]::ToString($sha256.ComputeHash($diskBytes)).Replace('-', '').ToLowerInvariant()`);
  psOut.push(`      if ($diskHash -ne $f.Sha256) { $contentDiff += $f.RelativePath }`);
  psOut.push(`    } catch {`);
  psOut.push(`      Write-Host ("[warn] Could not validate content for: " + $f.RelativePath + " :: " + $_.Exception.Message) -ForegroundColor Yellow`);
  psOut.push(`    }`);
  psOut.push(`  }`);
  psOut.push(`  $sha256.Dispose()`);
  psOut.push('');
  psOut.push(`  $createdFiles = Get-ChildItem -LiteralPath $ProjectRoot -File -Recurse -Force | Measure-Object | Select-Object -ExpandProperty Count`);
  psOut.push(`  $createdDirs  = Get-ChildItem -LiteralPath $ProjectRoot -Directory -Recurse -Force | Measure-Object | Select-Object -ExpandProperty Count`);
  psOut.push(`  Write-Host ("[verify] Expected files: $ExpectedTotalFiles | Created: $createdFiles")`);
  psOut.push(`  Write-Host ("[verify] Expected dirs:  $ExpectedTotalDirectories | Created: $createdDirs")`);
  psOut.push('');
  psOut.push(`  if ($missing.Count -gt 0) {`);
  psOut.push(`    Write-Host '[!] Missing files:' -ForegroundColor Red`);
  psOut.push(`    $missing | ForEach-Object { Write-Host ('  - ' + $_) }`);
  psOut.push(`  }`);
  psOut.push(`  if ($contentDiff.Count -gt 0) {`);
  psOut.push(`    Write-Host '[!] Content differences (after newline normalization):' -ForegroundColor Yellow`);
  psOut.push(`    $contentDiff | ForEach-Object { Write-Host ('  - ' + $_) }`);
  psOut.push(`  }`);
  psOut.push('');
  psOut.push(`  Write-Host '[i] Final directory tree:' -ForegroundColor Cyan`);
  psOut.push(`  Get-ChildItem -LiteralPath $ProjectRoot -Recurse -Force | ForEach-Object {`);
  psOut.push(`    $rel = $_.FullName.Substring($ProjectRoot.Length + 1)`);
  psOut.push(`    $depth = ($rel -split '[\\/]').Count`);
  psOut.push(`    $indent = ('  ' * ([Math]::Max($depth - 1, 0)))`);
  psOut.push(`    if (Test-Path -LiteralPath $_.FullName -PathType Container) {`);
  psOut.push(`      Write-Host ($indent + '[D] ' + $rel)`);
  psOut.push(`    } else {`);
  psOut.push(`      Write-Host ($indent + '[F] ' + $rel)`);
  psOut.push(`    }`);
  psOut.push(`  }`);
  psOut.push('');
  psOut.push(`  if ($missing.Count -eq 0 -and $createdFiles -eq $ExpectedTotalFiles -and $contentDiff.Count -eq 0) {`);
  psOut.push(`    Write-Host '[SUCCESS] 100% completion verified.' -ForegroundColor Green`);
  psOut.push(`  } else {`);
  psOut.push(`    Write-Host '[WARN] Validation reported issues. See details above.' -ForegroundColor Yellow`);
  psOut.push(`  }`);
  psOut.push('');
  psOut.push(`} catch {`);
  psOut.push(`  Write-Host ('[fatal] ' + $_.Exception.Message) -ForegroundColor Red`);
  psOut.push(`  exit 1`);
  psOut.push(`}`);

  const { outPath, partCount } = await writeGeneratedOutput(psOut, fileEntries);
  console.log(
    `[ok] Wrote ${outPath} plus ${partCount} payload parts with ${fileEntries.length} files embedded. ` +
      `Each generated file is capped at ${MAX_GENERATED_LINES} lines.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


