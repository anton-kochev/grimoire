import { describe, it, expect } from 'vitest';
import { sampleManifest, sampleHookInput } from './fixtures.js';

describe('Test Infrastructure', () => {
  it('should load fixtures correctly', () => {
    expect(sampleManifest.version).toBe('1.0.0');
    expect(sampleManifest.skills).toHaveLength(2);
  });

  it('should have valid hook input fixture', () => {
    expect(sampleHookInput.prompt).toBeDefined();
    expect(sampleHookInput.session_id).toBeDefined();
    expect(sampleHookInput.timestamp).toBeDefined();
  });
});
