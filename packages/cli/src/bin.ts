#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { runAdd } from './commands/add.js';
import { runLogs } from './commands/logs.js';

const addCommand = defineCommand({
  meta: {
    name: 'add',
    description: 'Install agents and skills from a pack into your project',
  },
  args: {
    pack: {
      type: 'positional',
      description: 'Pack name (npm package)',
      required: true,
    },
    pick: {
      type: 'string',
      description: 'Pick specific item by name, or use bare --pick for interactive selection',
    },
  },
  async run({ args }) {
    await runAdd(args.pack, args.pick, process.cwd());
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
    name: 'claudify',
    version: '0.1.0',
    description: 'CLI tool for installing Claudify agent and skill packs',
  },
  subCommands: {
    add: addCommand,
    logs: logsCommand,
  },
});

runMain(main);
