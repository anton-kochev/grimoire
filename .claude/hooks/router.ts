#!/usr/bin/env npx tsx
/**
 * Grimoire Router Hook - Entry point for Claude Code hook system
 *
 * This file is invoked by Claude Code's hook system.
 * It delegates to the @grimoire-cc/router package for processing.
 */

import { main } from '../../packages/router/src/main.js';

// Execute main function when run as hook
main();
