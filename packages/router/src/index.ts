/**
 * @grimoire-cc/router
 *
 * Hook runtime for Grimoire — skill auto-activation and agent enforcement.
 * Matches user prompts against configured skill triggers
 * and injects relevant skill references into LLM context.
 */

export * from './types.js';
export * from './normalize.js';
export * from './signals.js';
export * from './scoring.js';
export * from './matching.js';
export * from './filtering.js';
export * from './formatting.js';
export * from './manifest.js';
export * from './input.js';
export * from './logging.js';
export * from './output.js';
export * from './args.js';
export * from './tool-input.js';
export * from './tool-formatting.js';
export * from './tool-output.js';
export * from './main.js';
