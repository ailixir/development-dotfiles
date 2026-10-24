#!/usr/bin/env node
'use strict';

// Project adapter only; execution remains in the registered shared package.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const projectRoot = path.resolve(__dirname, '..');
const registrationPath = path.join(projectRoot, 'docs/workflows/lean-delivery.json');

try {
  const registration = JSON.parse(fs.readFileSync(registrationPath, 'utf8'));
  if (registration.schemaVersion !== 1 || registration.workflowId !== 'lean-delivery') {
    throw new Error('Unsupported project Lean registration');
  }
  const configuredRoot = process.env.AIOX_LEAN_PACKAGE_ROOT || registration.packageRoot;
  if (typeof configuredRoot !== 'string' || !path.isAbsolute(configuredRoot)) {
    throw new Error('The shared packageRoot must be an absolute path');
  }
  const packageRoot = fs.realpathSync(configuredRoot);
  const cli = path.join(packageRoot, 'bin/aiox-lean.js');
  const workflowPath = path.join(packageRoot, '.aiox-core/development/workflows/lean-delivery.yaml');
  const { loadWorkflow } = require(path.join(packageRoot, '.aiox-core/core/lean-delivery/validation.js'));
  const workflow = loadWorkflow(workflowPath);
  if (workflow.definition.version !== registration.expectedWorkflowVersion) {
    throw new Error('Shared workflow version differs from the project registration');
  }
  if (!fs.statSync(cli).isFile()) throw new Error('Shared companion CLI is missing');
  const args = process.argv.slice(2);
  if (args[0] === 'doctor') {
    if (args.length !== 1) throw new Error('doctor accepts no additional arguments');
    const skill = path.join(projectRoot, '.agents/skills/aiox-lean/SKILL.md');
    const claudeSkill = path.join(projectRoot, '.claude/skills/aiox-lean/SKILL.md');
    if (!fs.lstatSync(path.dirname(skill)).isDirectory() || fs.lstatSync(path.dirname(skill)).isSymbolicLink()) {
      throw new Error('The project .agents skill must be a real local directory for Cursor compatibility');
    }
    if (fs.realpathSync(skill) !== fs.realpathSync(claudeSkill)) {
      throw new Error('Claude and the shared project skill resolve to different files');
    }
    const skillText = fs.readFileSync(skill, 'utf8');
    if (!/^name: aiox-lean$/m.test(skillText)) throw new Error('Project skill name is not aiox-lean');
    for (const file of ['AGENTS.md', 'CLAUDE.md']) {
      if (!fs.readFileSync(path.join(projectRoot, file), 'utf8').includes('<!-- aiox-lean:begin -->')) {
        throw new Error(`Lean context registration missing from ${file}`);
      }
    }
    process.stdout.write(JSON.stringify({
      ok: true, projectId: registration.projectId, projectRoot, packageRoot,
      workflowId: workflow.definition.id, workflowVersion: workflow.definition.version,
      entryTask: workflow.tasks.entry.path,
      clients: { codex: '$aiox-lean', claudeCode: '/aiox-lean', cursor: '/aiox-lean' },
      validation: 'Local wiring and shared resource validation; no model, product checks or workflow state created',
    }, null, 2) + '\n');
  } else {
    const child = spawnSync(process.execPath, [cli, ...args], { cwd: process.cwd(), stdio: 'inherit', shell: false });
    if (child.error) throw child.error;
    process.exitCode = child.status === null ? 1 : child.status;
  }
} catch (error) {
  process.stderr.write(JSON.stringify({ ok: false, error: error.message, registrationPath }) + '\n');
  process.exitCode = 1;
}
