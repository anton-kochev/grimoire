#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import { runAdd } from './commands/add.js';

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

const main = defineCommand({
  meta: {
    name: 'claudify',
    version: '0.1.0',
    description: 'CLI tool for installing Claudify agent and skill packs',
  },
  subCommands: {
    add: addCommand,
  },
});

runMain(main);
