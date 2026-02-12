export { loadManifest } from './manifest.js';
export { resolvePackDir } from './resolve.js';
export { copyAgent, copySkill, copyItems } from './copy.js';
export { printSummary } from './summary.js';
export { promptForItems } from './prompt.js';
export { runAdd } from './commands/add.js';
export { runLogs } from './commands/logs.js';
export type { LogsOptions } from './commands/logs.js';
export { mergeSettings, mergeManifest, setupRouter } from './setup.js';
export { scanInstalled, removeItems, cleanManifest } from './remove.js';
export { runRemove } from './commands/remove.js';
export type {
  PackSkillTriggers,
  PackAgentEntry,
  PackSkillEntry,
  PackManifest,
  InstallItem,
  InstallResult,
  InstallSummary,
  RemoveResult,
  RemoveSummary,
} from './types.js';
