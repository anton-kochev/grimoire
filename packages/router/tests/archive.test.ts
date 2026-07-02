import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { gunzipSync } from 'zlib';
import {
  archiveSubagentRun,
  encodeProjectDirName,
  locateSubagentTranscript,
  pruneAgentArchive,
} from '../src/archive.js';
import type { SubagentHookInput } from '../src/types.js';

function makeTmpDir(prefix: string): string {
  const raw = join(tmpdir(), `archive-test-${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

const SESSION_ID = 'sess-1234';
const AGENT_ID = 'a87fd89935398ed73';
const AGENT_TYPE = 'grimoire.typescript-coder';
const JSONL_CONTENT = '{"type":"user","message":{"content":"do the thing"}}\n{"type":"assistant"}\n';
const META_CONTENT = JSON.stringify({ agentType: AGENT_TYPE, description: 'do the thing' });

/**
 * Lays out a fake Claude Code transcript tree:
 *   <root>/<sessionId>.jsonl                          (main session transcript)
 *   <root>/<sessionId>/subagents/agent-<id>.jsonl     (sub-agent transcript)
 *   <root>/<sessionId>/subagents/agent-<id>.meta.json (optional)
 */
function makeTranscriptTree(root: string, opts: { meta?: boolean; agentType?: string } = {}): { transcriptPath: string } {
  const transcriptPath = join(root, `${SESSION_ID}.jsonl`);
  writeFileSync(transcriptPath, '{"cwd":"/some/project"}\n');
  const subDir = join(root, SESSION_ID, 'subagents');
  mkdirSync(subDir, { recursive: true });
  writeFileSync(join(subDir, `agent-${AGENT_ID}.jsonl`), JSONL_CONTENT);
  if (opts.meta !== false) {
    const metaContent = opts.agentType
      ? JSON.stringify({ agentType: opts.agentType, description: 'do the thing' })
      : META_CONTENT;
    writeFileSync(join(subDir, `agent-${AGENT_ID}.meta.json`), metaContent);
  }
  return { transcriptPath };
}

function makeInput(overrides: Partial<SubagentHookInput> = {}): SubagentHookInput {
  return {
    session_id: SESSION_ID,
    agent_id: AGENT_ID,
    agent_type: AGENT_TYPE,
    stop_reason: 'success',
    ...overrides,
  };
}

function writeInsightsConfig(projectDir: string, insights: Record<string, unknown>): void {
  const claudeDir = join(projectDir, '.claude');
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, 'grimoire.json'), JSON.stringify({ insights }));
}

function archivedGzPath(projectDir: string): string {
  return join(projectDir, '.claude', 'grimoire', 'sessions', AGENT_TYPE, SESSION_ID, `agent-${AGENT_ID}.jsonl.gz`);
}

function archivedMetaPath(projectDir: string): string {
  return join(projectDir, '.claude', 'grimoire', 'sessions', AGENT_TYPE, SESSION_ID, `agent-${AGENT_ID}.meta.json`);
}

// =============================================================================
// encodeProjectDirName
// =============================================================================

describe('encodeProjectDirName', () => {
  it('should replace slashes and dots with dashes (Claude Code convention)', () => {
    expect(encodeProjectDirName('/Users/anton/sources/repos/my.project')).toBe(
      '-Users-anton-sources-repos-my-project',
    );
  });
});

// =============================================================================
// locateSubagentTranscript
// =============================================================================

describe('locateSubagentTranscript', () => {
  let transcriptsRoot: string;

  beforeEach(() => {
    transcriptsRoot = makeTmpDir('locate');
  });

  afterEach(() => {
    rmSync(transcriptsRoot, { recursive: true, force: true });
  });

  it('should locate the sub-agent transcript next to the main transcript_path', () => {
    // Arrange
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);
    const input = makeInput({ transcript_path: transcriptPath });

    // Act
    const located = locateSubagentTranscript(input);

    // Assert
    expect(located).not.toBeNull();
    expect(located?.jsonl).toBe(join(transcriptsRoot, SESSION_ID, 'subagents', `agent-${AGENT_ID}.jsonl`));
    expect(located?.meta).toBe(join(transcriptsRoot, SESSION_ID, 'subagents', `agent-${AGENT_ID}.meta.json`));
  });

  it('should prefer an explicit agent_transcript_path over reconstruction', () => {
    // Arrange — real sub-agent file exists, but the agent_id is wrong on purpose;
    // only the explicit path can locate it, proving the payload path wins.
    makeTranscriptTree(transcriptsRoot);
    const jsonl = join(transcriptsRoot, SESSION_ID, 'subagents', `agent-${AGENT_ID}.jsonl`);
    const input = makeInput({ agent_transcript_path: jsonl, agent_id: 'does-not-match' });

    // Act
    const located = locateSubagentTranscript(input);

    // Assert
    expect(located?.jsonl).toBe(jsonl);
    expect(located?.meta).toBe(join(transcriptsRoot, SESSION_ID, 'subagents', `agent-${AGENT_ID}.meta.json`));
  });

  it('should fall back to the encoded-cwd convention when transcript_path is absent', () => {
    // Arrange — projects root contains <encoded-cwd>/<session>/subagents/…
    const cwd = '/Users/anton/some.project';
    const projectTranscripts = join(transcriptsRoot, encodeProjectDirName(cwd));
    mkdirSync(projectTranscripts, { recursive: true });
    makeTranscriptTree(projectTranscripts);
    const input = makeInput({ cwd });

    // Act
    const located = locateSubagentTranscript(input, transcriptsRoot);

    // Assert
    expect(located?.jsonl).toBe(join(projectTranscripts, SESSION_ID, 'subagents', `agent-${AGENT_ID}.jsonl`));
  });

  it('should return null when the sub-agent transcript file does not exist', () => {
    // Arrange — main transcript exists but no subagents dir
    const transcriptPath = join(transcriptsRoot, `${SESSION_ID}.jsonl`);
    writeFileSync(transcriptPath, '{}\n');
    const input = makeInput({ transcript_path: transcriptPath });

    // Act / Assert
    expect(locateSubagentTranscript(input)).toBeNull();
  });

  it('should return null when agent_id is missing', () => {
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);
    const input = makeInput({ transcript_path: transcriptPath });
    delete input.agent_id;

    expect(locateSubagentTranscript(input)).toBeNull();
  });

  it('should return null when neither transcript_path nor cwd is provided', () => {
    makeTranscriptTree(transcriptsRoot);

    expect(locateSubagentTranscript(makeInput(), transcriptsRoot)).toBeNull();
  });
});

// =============================================================================
// archiveSubagentRun
// =============================================================================

describe('archiveSubagentRun', () => {
  let transcriptsRoot: string;
  let projectDir: string;

  beforeEach(() => {
    transcriptsRoot = makeTmpDir('src');
    projectDir = makeTmpDir('proj');
  });

  afterEach(() => {
    rmSync(transcriptsRoot, { recursive: true, force: true });
    rmSync(projectDir, { recursive: true, force: true });
  });

  it('should archive the gzipped transcript and verbatim meta under <agentType>/<sessionId>/', () => {
    // Arrange
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);
    const input = makeInput({ transcript_path: transcriptPath });

    // Act
    const archived = archiveSubagentRun(input, projectDir);

    // Assert — gunzipped bytes identical to the source transcript
    expect(archived).toBe(true);
    expect(existsSync(archivedGzPath(projectDir))).toBe(true);
    expect(gunzipSync(readFileSync(archivedGzPath(projectDir))).toString('utf-8')).toBe(JSONL_CONTENT);
    expect(readFileSync(archivedMetaPath(projectDir), 'utf-8')).toBe(META_CONTENT);
  });

  it('should not leave a .tmp file behind after archiving', () => {
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);

    archiveSubagentRun(makeInput({ transcript_path: transcriptPath }), projectDir);

    const sessionDir = join(projectDir, '.claude', 'grimoire', 'sessions', AGENT_TYPE, SESSION_ID);
    expect(readdirSync(sessionDir).filter((f) => f.endsWith('.tmp'))).toHaveLength(0);
  });

  it('should synthesize meta from the hook payload when the source meta is missing', () => {
    // Arrange
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot, { meta: false });
    const input = makeInput({ transcript_path: transcriptPath });

    // Act
    archiveSubagentRun(input, projectDir);

    // Assert
    const meta = JSON.parse(readFileSync(archivedMetaPath(projectDir), 'utf-8')) as Record<string, unknown>;
    expect(meta['agentType']).toBe(AGENT_TYPE);
    expect(meta['description']).toBe('');
  });

  it('should overwrite an existing archive on re-stop (source may be fuller)', () => {
    // Arrange — first archive, then the live transcript grows
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);
    const input = makeInput({ transcript_path: transcriptPath });
    archiveSubagentRun(input, projectDir);
    const fuller = JSONL_CONTENT + '{"type":"assistant","message":{"content":[]}}\n';
    writeFileSync(join(transcriptsRoot, SESSION_ID, 'subagents', `agent-${AGENT_ID}.jsonl`), fuller);

    // Act
    const archived = archiveSubagentRun(input, projectDir);

    // Assert
    expect(archived).toBe(true);
    expect(gunzipSync(readFileSync(archivedGzPath(projectDir))).toString('utf-8')).toBe(fuller);
  });

  it('should return false and write nothing when the transcript cannot be located', () => {
    // Arrange — transcript_path points at nothing
    const input = makeInput({ transcript_path: join(transcriptsRoot, 'missing.jsonl') });

    // Act / Assert — degrade, never throw
    expect(archiveSubagentRun(input, projectDir)).toBe(false);
    expect(existsSync(join(projectDir, '.claude', 'grimoire'))).toBe(false);
  });

  it('should archive under the meta agentType when the payload omits agent_type', () => {
    // Arrange — production reality: the SubagentStop payload sends an empty
    // agent_type, so the sibling meta.json is the source of truth.
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);
    const input = makeInput({ transcript_path: transcriptPath, agent_type: '' });

    // Act
    const archived = archiveSubagentRun(input, projectDir);

    // Assert — archived under the meta's agentType (AGENT_TYPE)
    expect(archived).toBe(true);
    expect(existsSync(archivedGzPath(projectDir))).toBe(true);
  });

  it('should return false when neither the payload nor the meta provides an agent type', () => {
    // Arrange — transcript present, but meta has no agentType and payload none
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);
    writeFileSync(
      join(transcriptsRoot, SESSION_ID, 'subagents', `agent-${AGENT_ID}.meta.json`),
      JSON.stringify({ description: 'no type here' }),
    );
    const input = makeInput({ transcript_path: transcriptPath, agent_type: '' });

    // Act / Assert
    expect(archiveSubagentRun(input, projectDir)).toBe(false);
    expect(existsSync(join(projectDir, '.claude', 'grimoire'))).toBe(false);
  });

  it('should be disabled by insights.archive: false', () => {
    // Arrange
    writeInsightsConfig(projectDir, { archive: false });
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);

    // Act / Assert
    expect(archiveSubagentRun(makeInput({ transcript_path: transcriptPath }), projectDir)).toBe(false);
    expect(existsSync(join(projectDir, '.claude', 'grimoire'))).toBe(false);
  });

  it('should be disabled by insights.retainRunsPerAgent: 0', () => {
    writeInsightsConfig(projectDir, { retainRunsPerAgent: 0 });
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);

    expect(archiveSubagentRun(makeInput({ transcript_path: transcriptPath }), projectDir)).toBe(false);
  });

  it('should sanitize a hostile meta agentType so the archive stays inside the sessions root', () => {
    // Arrange — the meta.json (source of truth) carries a path-traversal type
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);
    writeFileSync(
      join(transcriptsRoot, SESSION_ID, 'subagents', `agent-${AGENT_ID}.meta.json`),
      JSON.stringify({ agentType: '../../evil', description: '' }),
    );
    const input = makeInput({ transcript_path: transcriptPath });

    // Act
    const archived = archiveSubagentRun(input, projectDir);

    // Assert — nothing escapes .claude/grimoire/sessions
    expect(archived).toBe(true);
    const sessionsRoot = join(projectDir, '.claude', 'grimoire', 'sessions');
    expect(existsSync(join(sessionsRoot, '..-..-evil', SESSION_ID, `agent-${AGENT_ID}.jsonl.gz`))).toBe(true);
    expect(existsSync(join(projectDir, 'evil'))).toBe(false);
  });

  it('should prune the archived agent type down to retainRunsPerAgent', () => {
    // Arrange — retention of 2, then archive 3 distinct runs of the same type
    writeInsightsConfig(projectDir, { retainRunsPerAgent: 2 });
    const sessions = ['sess-old', 'sess-mid', 'sess-new'];
    sessions.forEach((sessionId, i) => {
      const transcriptPath = join(transcriptsRoot, `${sessionId}.jsonl`);
      writeFileSync(transcriptPath, '{}\n');
      const subDir = join(transcriptsRoot, sessionId, 'subagents');
      mkdirSync(subDir, { recursive: true });
      writeFileSync(join(subDir, `agent-run${i}.jsonl`), JSONL_CONTENT);
      archiveSubagentRun(
        makeInput({ transcript_path: transcriptPath, session_id: sessionId, agent_id: `run${i}` }),
        projectDir,
      );
      // Force distinct, ordered mtimes (archiving happens within the same ms)
      const gz = join(projectDir, '.claude', 'grimoire', 'sessions', AGENT_TYPE, sessionId, `agent-run${i}.jsonl.gz`);
      const t = new Date(2026, 0, 1 + i);
      utimesSync(gz, t, t);
    });

    // Act — one more archive triggers the prune with 3 already on disk
    const transcriptPath = join(transcriptsRoot, `${SESSION_ID}.jsonl`);
    makeTranscriptTree(transcriptsRoot);
    archiveSubagentRun(makeInput({ transcript_path: transcriptPath }), projectDir);

    // Assert — only the 2 newest survive; oldest session dirs removed entirely
    const typeDir = join(projectDir, '.claude', 'grimoire', 'sessions', AGENT_TYPE);
    const remaining = readdirSync(typeDir).sort();
    expect(remaining).toEqual(['sess-new', SESSION_ID].sort());
    expect(existsSync(join(typeDir, 'sess-old'))).toBe(false);
    expect(existsSync(join(typeDir, 'sess-mid'))).toBe(false);
  });

  it('should not prune other agent types', () => {
    // Arrange — one archived run of a different type
    writeInsightsConfig(projectDir, { retainRunsPerAgent: 1 });
    const otherTree = join(transcriptsRoot, 'other');
    mkdirSync(otherTree, { recursive: true });
    const { transcriptPath: otherPath } = makeTranscriptTree(otherTree, { agentType: 'grimoire.rust-coder' });
    archiveSubagentRun(
      makeInput({ transcript_path: otherPath, agent_type: 'grimoire.rust-coder' }),
      projectDir,
    );

    // Act — archive a run of the main type
    const { transcriptPath } = makeTranscriptTree(transcriptsRoot);
    archiveSubagentRun(makeInput({ transcript_path: transcriptPath }), projectDir);

    // Assert — the other type's archive is untouched
    const otherGz = join(projectDir, '.claude', 'grimoire', 'sessions', 'grimoire.rust-coder', SESSION_ID, `agent-${AGENT_ID}.jsonl.gz`);
    expect(existsSync(otherGz)).toBe(true);
  });
});

// =============================================================================
// pruneAgentArchive
// =============================================================================

describe('pruneAgentArchive', () => {
  let typeDir: string;

  beforeEach(() => {
    typeDir = makeTmpDir('prune');
  });

  afterEach(() => {
    rmSync(typeDir, { recursive: true, force: true });
  });

  function writeArchivedRun(sessionId: string, agentId: string, mtime: Date): void {
    const dir = join(typeDir, sessionId);
    mkdirSync(dir, { recursive: true });
    const gz = join(dir, `agent-${agentId}.jsonl.gz`);
    writeFileSync(gz, 'gz');
    writeFileSync(join(dir, `agent-${agentId}.meta.json`), '{}');
    utimesSync(gz, mtime, mtime);
  }

  it('should delete the oldest runs beyond the retention count, with their meta files', () => {
    // Arrange
    writeArchivedRun('s1', 'a1', new Date(2026, 0, 1));
    writeArchivedRun('s2', 'a2', new Date(2026, 0, 2));
    writeArchivedRun('s3', 'a3', new Date(2026, 0, 3));

    // Act
    pruneAgentArchive(typeDir, 2);

    // Assert
    expect(existsSync(join(typeDir, 's1'))).toBe(false);
    expect(existsSync(join(typeDir, 's2', 'agent-a2.jsonl.gz'))).toBe(true);
    expect(existsSync(join(typeDir, 's3', 'agent-a3.jsonl.gz'))).toBe(true);
  });

  it('should do nothing when the count is within retention', () => {
    writeArchivedRun('s1', 'a1', new Date(2026, 0, 1));

    pruneAgentArchive(typeDir, 2);

    expect(existsSync(join(typeDir, 's1', 'agent-a1.jsonl.gz'))).toBe(true);
  });

  it('should not throw on a missing directory', () => {
    expect(() => pruneAgentArchive(join(typeDir, 'nope'), 2)).not.toThrow();
  });
});
