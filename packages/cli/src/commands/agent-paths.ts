/**
 * `runAgentPathsFor` — manage enforcement file patterns for a specific agent.
 * Reads/writes patterns in skills-manifest.json.
 * Hook re-sync is the caller's responsibility.
 */

import * as clack from '@clack/prompts';
import { readManifest, writeManifest } from '../enforce.js';

type Action = 'add' | 'remove' | 'done';

/**
 * Runs the path add/remove action for a specific agent.
 * Used by the unified `list` flow.
 */
export async function runAgentPathsFor(projectDir: string, agentName: string): Promise<void> {
  const manifest = readManifest(projectDir);
  const entry = manifest.agents[agentName];
  const currentPaths = entry?.file_patterns ?? [];

  if (currentPaths.length > 0) {
    clack.log.info(`Current paths: ${currentPaths.join(', ')}`);
  } else {
    clack.log.info('No enforcement paths configured.');
  }

  const action = await clack.select<Action>({
    message: 'What would you like to do?',
    options: [
      { value: 'add' as const, label: 'Add path', hint: 'e.g. *.ts, *.cs, **/*.vue, src/api/**' },
      { value: 'remove' as const, label: 'Remove paths', ...(currentPaths.length === 0 && { hint: 'none to remove' }) },
      { value: 'done' as const, label: 'Done' },
    ],
  });

  if (clack.isCancel(action) || action === 'done') return;

  if (action === 'add') {
    const pattern = await clack.text({
      message: 'Enter a glob pattern (e.g. *.ts, **/*.vue):',
    });

    if (clack.isCancel(pattern)) return;

    const trimmed = (pattern as string).trim();
    if (trimmed) {
      if (!manifest.agents[agentName]) {
        manifest.agents[agentName] = {};
      }
      manifest.agents[agentName]!.file_patterns = [...currentPaths, trimmed];
      writeManifest(projectDir, manifest);
      clack.log.success(`Added pattern: ${trimmed}`);
    }
  }

  if (action === 'remove') {
    if (currentPaths.length === 0) {
      clack.log.warn('No paths to remove.');
      return;
    }

    const selected = await clack.multiselect<string>({
      message: 'Select paths to remove:',
      options: currentPaths.map((p) => ({ value: p, label: p })),
      required: false,
    });

    if (clack.isCancel(selected)) return;

    const toRemove = new Set(selected as string[]);
    if (toRemove.size > 0) {
      const remaining = currentPaths.filter((p) => !toRemove.has(p));
      manifest.agents[agentName]!.file_patterns = remaining;
      writeManifest(projectDir, manifest);
      clack.log.success(`Removed ${toRemove.size} path(s).`);
    }
  }
}
