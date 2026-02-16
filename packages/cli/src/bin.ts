#!/usr/bin/env node
import { createRequire } from 'node:module';
import { defineCommand, runMain } from 'citty';
import { runAdd } from './commands/add.js';
import { runRemove, runRemovePack } from './commands/remove.js';
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
    description: 'Remove agents and skills from your project',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Item name to remove',
      required: false,
    },
    pick: {
      type: 'string',
      description: 'Interactive selection of items to remove',
    },
    pack: {
      type: 'string',
      description: 'Remove all items from a pack',
    },
  },
  async run({ args }) {
    if (args.pack && args.name) {
      throw new Error('Cannot use --pack with a positional item name');
    }

    if (args.pack) {
      await runRemovePack(args.pack, process.cwd());
    } else {
      await runRemove(args.name, args.pick, process.cwd());
    }
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
