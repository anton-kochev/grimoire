#!/usr/bin/env node
import { createRequire } from 'node:module';
import { defineCommand, runMain } from 'citty';
import { runAdd } from './commands/add.js';
import { runRemoveInteractive } from './commands/remove.js';
import { runLogs } from './commands/logs.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Interactive wizard to install agents and skills from available packs',
  },
  async run() {
    await runAdd(process.cwd());
  },
});

const removeCommand = defineCommand({
  meta: {
    name: 'remove',
    description: 'Interactively remove installed agents and skills',
  },
  async run() {
    await runRemoveInteractive(process.cwd());
  },
});

const logsCommand = defineCommand({
  meta: {
    name: 'logs',
    description: 'Open skill-router log viewer in the browser',
  },
  args: {
    file: {
      type: 'string',
      description: 'Custom log file path (default: .claude/logs/skill-router.log)',
    },
    port: {
      type: 'string',
      description: 'Port to serve on (default: OS-assigned)',
    },
  },
  async run({ args }) {
    const server = await runLogs(process.cwd(), {
      logFile: args.file || undefined,
      port: args.port ? Number(args.port) : undefined,
    });

    const addr = server.address();
    if (addr && typeof addr === 'object') {
      console.log(`Log viewer running at http://127.0.0.1:${addr.port}`);
      console.log('Press Ctrl+C to stop');
    }

    process.on('SIGINT', () => {
      server.close();
      process.exit(0);
    });
  },
});

const main = defineCommand({
  meta: {
    name: 'grimoire',
    version,
    description: 'CLI tool for installing Grimoire agent and skill packs',
  },
  subCommands: {
    add: addCommand,
    remove: removeCommand,
    logs: logsCommand,
  },
});

runMain(main);
