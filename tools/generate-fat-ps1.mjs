#!/usr/bin/env node
/*
  Generates a single, self-contained PowerShell script that recreates the project
  from embedded file contents. It scans the configured roots and additional files,
  reads content, and emits a PS1 file with here-strings for each file.

  Usage:
    node tools/generate-fat-ps1.mjs

  Output:
    ./put-checks-fat.ps1
*/

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const PROJECT_NAME = 'put-checks';
const REPO_ROOT = process.cwd();
const PROJECT_ROOTS = ['src', 'public'];
const ADDITIONAL_FILES = [
  'package.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'vitest.config.ts',
  'webpack.config.js',
  'webpack.config.cjs',
];
const EXCLUDE_PATTERNS = [
  /(^|\/)node_modules(\/|$)/i,
  /\.log$/i,
  /\.tmp$/i,
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

function sha256String(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function toPowerShellHereString(content) {
  // Normalize to LF for embedding; Out-File will handle platform endings
  const normalized = content.replace(/\r\n/g, '\n');
  return `@'\n${normalized}\n'@`;
}

function escapeSingleQuotes(s) {
  return s.replace(/'/g, "''");
}

async function main() {
  // Gather files from roots
  const gathered = [];
  for (const root of PROJECT_ROOTS) {
    const absRoot = path.join(REPO_ROOT, root);
    const st = await statSafe(absRoot);
    if (!st || !st.isDirectory()) continue;
    const list = await readDirRecursive(absRoot);
    // relativePath should be prefixed with root ('src/...' or 'public/...') already
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
    const content = await fs.promises.readFile(f.absolutePath, 'utf8').catch(() => '');
    const size = Buffer.byteLength(content, 'utf8');
    const hash = sha256String(content);
    fileEntries.push({ ...f, content, size, hash });
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
  psOut.push(`$PSMajor = $PSVersionTable.PSVersion.Major`);
  psOut.push(`if ($PSMajor -ge 7) { $EncodingChoice = 'utf8BOM' } else { $EncodingChoice = 'utf8' }`);
  psOut.push('');
  psOut.push(`# Auto-elevate if on Windows and not running as admin`);
  psOut.push(`try {`);
  psOut.push(`  if ($IsWindows) {`);
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
  let index = 0;
  for (const f of fileEntries) {
    index += 1;
    psOut.push('');
    psOut.push(`# File ${index}: ${f.relativePath}`);
    psOut.push(`$Files += [pscustomobject]@{`);
    psOut.push(`  RelativePath = '${escapeSingleQuotes(f.relativePath)}'`);
    psOut.push(`  SizeBytes    = ${f.size}`);
    psOut.push(`  Sha256       = '${f.hash}'`);
    psOut.push(`  Content      = ${toPowerShellHereString(f.content)}`);
    psOut.push(`}`);
  }
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
  psOut.push(`      $f.Content | Out-File -LiteralPath $target -Encoding $EncodingChoice`);
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
  psOut.push(`  foreach ($f in $Files) {`);
  psOut.push(`    $target = Join-Path $ProjectRoot $f.RelativePath`);
  psOut.push(`    if (-not (Test-Path -Path $target)) { $missing += $f.RelativePath; continue }`);
  psOut.push(`    try {`);
  psOut.push(`      $disk = Get-Content -LiteralPath $target -Raw -ErrorAction Stop`);
  psOut.push(`      # Normalize newlines to LF for consistent comparison`);
  psOut.push(`      $diskNorm = $disk -replace "\`r\`n", "\`n"`);
  psOut.push(`      $memNorm  = $f.Content -replace "\`r\`n", "\`n"`);
  psOut.push(`      if ($diskNorm -ne $memNorm) { $contentDiff += $f.RelativePath }`);
  psOut.push(`    } catch {`);
  psOut.push(`      Write-Host ("[warn] Could not validate content for: " + $f.RelativePath + " :: " + $_.Exception.Message) -ForegroundColor Yellow`);
  psOut.push(`    }`);
  psOut.push(`  }`);
  psOut.push('');
  psOut.push(`  $createdFiles = Get-ChildItem -LiteralPath $ProjectRoot -File -Recurse | Measure-Object | Select-Object -ExpandProperty Count`);
  psOut.push(`  $createdDirs  = Get-ChildItem -LiteralPath $ProjectRoot -Directory -Recurse | Measure-Object | Select-Object -ExpandProperty Count`);
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
  psOut.push(`  Get-ChildItem -LiteralPath $ProjectRoot -Recurse | ForEach-Object {`);
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

  const outPath = path.join(REPO_ROOT, 'put-checks-fat.ps1');
  await fs.promises.writeFile(outPath, psOut.join('\n'), 'utf8');
  console.log(`[ok] Wrote ${outPath} with ${fileEntries.length} files embedded.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


