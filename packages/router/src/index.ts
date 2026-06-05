/**
 * @grimoire-cc/router
 *
 * Hook runtime for Grimoire — agent enforcement and the subagent session registry
 * (enforcement bypass). Subagent skill injection is handled natively by Claude Code
 * via the `skills:` field in agent frontmatter. Bare legacy matching hooks are no-ops.
 */

export * from './types.js';
export * from './manifest.js';
export * from './input.js';
export * from './logging.js';
export * from './args.js';
export * from './enforce.js';
