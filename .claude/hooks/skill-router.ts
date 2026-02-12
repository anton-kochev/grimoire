#!/usr/bin/env npx tsx
/**
 * Skill Router Hook - Entry point for Claude Code hook system
 *
 * This file is invoked by Claude Code's UserPromptSubmit hook.
 * It delegates to the @grimoire-cc/skill-router package for processing.
 */

import { main } from '../../packages/skill-router/src/main.js';

// Execute main function when run as hook
main();
