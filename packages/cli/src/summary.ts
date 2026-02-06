import type { InstallSummary, InstallResult } from './types.js';

/**
 * Prints a formatted summary of installed items to the console.
 */
export function printSummary(summary: InstallSummary): void {
  console.log(`\nInstalled pack: ${summary.packName}@${summary.packVersion}`);

  if (summary.results.length === 0) {
    console.log('  nothing to install');
    return;
  }

  for (const result of summary.results) {
    const tag = result.overwritten ? ' (overwritten)' : '';
    const typeLabel = result.item.type === 'agent' ? 'agent' : 'skill';
    console.log(`  ${typeLabel}: ${result.item.name} -> ${result.destinationPath}${tag}`);
  }

  console.log(`\n${summary.results.length} item(s) installed.`);
}
