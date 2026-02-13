#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { runAdd } from './commands/add.js';
import { runRemove } from './commands/remove.js';
import { runLogs } from './commands/logs.js';
import { listAvailablePacks } from './resolve.js';

const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Install agents and skills from a pack into your project',
  },
  args: {
    pack: {
      type: 'positional',
      description: 'Pack name (e.g. dotnet-pack). Run grimoire add --list to see available packs.',
      required: false,
    },
    item: {
      type: 'positional',
      description: 'Item name to install (e.g. grimoire:csharp-coder). Omit to install all.',
      required: false,
    },
    list: {
      type: 'boolean',
      description: 'List available packs',
    },
    pick: {
      type: 'string',
      description: 'Pick specific item by name, or use bare --pick for interactive selection',
    },
    enableAutoActivation: {
      type: 'boolean',
      description: 'Configure skill-router hooks and manifest for automatic skill activation',
    },
  },
  async run({ args }) {
    if (args.list) {
      const packs = listAvailablePacks();
      if (packs.length === 0) {
        console.log('No packs available.');
      } else {
        console.log('Available packs:');
        for (const name of packs) {
          console.log(`  ${name}`);
        }
      }
      return;
    }

    if (!args.pack) {
      console.error('Error: Missing required argument "pack". Run grimoire add --list to see available packs.');
      process.exit(1);
    }

    const pick = args.pick ?? args.item;
    await runAdd(args.pack, pick, process.cwd(), args.enableAutoActivation);
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
  },
  async run({ args }) {
    await runRemove(args.name, args.pick, process.cwd());
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
    version: '0.4.1',
    description: 'CLI tool for installing Grimoire agent and skill packs',
  },
  subCommands: {
    add: addCommand,
    remove: removeCommand,
    logs: logsCommand,
  },
});

runMain(main);
