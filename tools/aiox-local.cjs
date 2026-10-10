#!/usr/bin/env node
'use strict';

// Use the checkout's workflow commands without loading unrelated optional CLI modules.
const { Command } = require('commander');
const { createSdcCommand } = require('../.aiox-core/cli/commands/sdc');
const { createWaveCommand } = require('../.aiox-core/cli/commands/wave');
const program = new Command().name('aiox-local');
program.addCommand(createSdcCommand());
program.addCommand(createWaveCommand());
program.parseAsync(process.argv).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
