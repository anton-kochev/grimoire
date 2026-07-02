import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync, appendFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Server } from 'node:http';
import { runLogs } from '../src/commands/logs.js';

function makeTmpDir(label: string): string {
  const raw = join(tmpdir(), `grimoire-logs-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(raw, { recursive: true });
  return realpathSync(raw);
}

function serverUrl(server: Server): string {
  const addr = server.address();
  if (addr && typeof addr === 'object') {
    return `http://127.0.0.1:${addr.port}`;
  }
  throw new Error('Server has no address');
}

describe('runLogs', () => {
  let projectDir: string;
  let server: Server | undefined;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
    if (projectDir) {
      rmSync(projectDir, { recursive: true, force: true });
    }
  });

  function setupLogFile(content: string, customPath?: string): string {
    const logPath = customPath
      ? join(projectDir, customPath)
      : join(projectDir, '.claude', 'logs', 'grimoire-router.log');
    mkdirSync(join(logPath, '..'), { recursive: true });
    writeFileSync(logPath, content);
    return logPath;
  }

  it('should exit with helpful message when log file is missing', async () => {
    projectDir = makeTmpDir('missing');

    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await runLogs(projectDir, { open: false }).catch(() => {});

    expect(mockExit).toHaveBeenCalledWith(1);
    const output = mockError.mock.calls.map((c) => c[0]).join('\n');
    expect(output).toMatch(/No Grimoire data found/i);

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('should start server and return Server instance', async () => {
    projectDir = makeTmpDir('start');
    setupLogFile('{"event":"test"}\n');

    server = await runLogs(projectDir, { open: false });

    expect(server).toBeDefined();
    expect(server.listening).toBe(true);
  });

  it('should serve HTML at / with correct Content-Type', async () => {
    projectDir = makeTmpDir('html');
    setupLogFile('{"event":"test"}\n');

    server = await runLogs(projectDir, { open: false });

    const res = await fetch(`${serverUrl(server)}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).toContain('Agent Insights');
    expect(body).toContain('autoFetch');
  });

  it('should serve NDJSON log data at /api/logs', async () => {
    projectDir = makeTmpDir('api');
    const logContent = '{"outcome":"activated","prompt_raw":"test"}\n';
    setupLogFile(logContent);

    server = await runLogs(projectDir, { open: false });

    const res = await fetch(`${serverUrl(server)}/api/logs`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/x-ndjson');
    const body = await res.text();
    expect(body).toBe(logContent);
  });

  it('should round-trip mixed entry kinds (enforce, subagent, error, legacy) at /api/logs', async () => {
    projectDir = makeTmpDir('mixed');
    const mixed = [
      '{"hook_event":"PreToolUse","outcome":"blocked","enforce_block":true,"file_basename":"a.ts","blocking_agents":["grimoire.typescript-coder"]}',
      '{"hook_event":"PreToolUse","outcome":"allow","owner_bypass":true,"agent_type":"grimoire.typescript-coder","file_basename":"a.ts"}',
      '{"hook_event":"SubagentStart","session_id":"s1","agent_id":"ag1","agent_type":"grimoire.csharp-coder"}',
      '{"hook_event":"SubagentStop","session_id":"s1","agent_id":"ag1","agent_type":"grimoire.csharp-coder","stop_reason":"success"}',
      '{"level":"error","message":"boom","error_type":"Error"}',
      '{"outcome":"activated","prompt_raw":"legacy skill-routing entry","skills_matched":[]}',
    ].join('\n') + '\n';
    setupLogFile(mixed);

    server = await runLogs(projectDir, { open: false });

    const res = await fetch(`${serverUrl(server)}/api/logs`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe(mixed);
  });

  it('should read fresh data on each request', async () => {
    projectDir = makeTmpDir('fresh');
    const logPath = setupLogFile('{"line":1}\n');

    server = await runLogs(projectDir, { open: false });

    const res1 = await fetch(`${serverUrl(server)}/api/logs`);
    const body1 = await res1.text();
    expect(body1).toBe('{"line":1}\n');

    appendFileSync(logPath, '{"line":2}\n');

    const res2 = await fetch(`${serverUrl(server)}/api/logs`);
    const body2 = await res2.text();
    expect(body2).toBe('{"line":1}\n{"line":2}\n');
  });

  it('should respect custom log file path', async () => {
    projectDir = makeTmpDir('custom');
    const customContent = '{"custom":true}\n';
    setupLogFile(customContent, 'my-logs/custom.log');

    server = await runLogs(projectDir, {
      open: false,
      logFile: 'my-logs/custom.log',
    });

    const res = await fetch(`${serverUrl(server)}/api/logs`);
    const body = await res.text();
    expect(body).toBe(customContent);
  });

  it('should return 500 if log file becomes unreadable', async () => {
    projectDir = makeTmpDir('unreadable');
    const logPath = setupLogFile('{"event":"test"}\n');

    server = await runLogs(projectDir, { open: false });

    // Remove the file to make it unreadable
    rmSync(logPath);

    const res = await fetch(`${serverUrl(server)}/api/logs`);
    expect(res.status).toBe(500);
  });

  it('should compute /api/insights from a sub-agent transcript tree', async () => {
    projectDir = makeTmpDir('insights');
    // Minimal enforcement log so runLogs starts (insights also works without it)
    setupLogFile('{"hook_event":"SubagentStart","session_id":"sess-1"}\n');
    // Only agents with a local definition are tracked
    const agentsDir = join(projectDir, '.claude', 'agents');
    mkdirSync(agentsDir, { recursive: true });
    writeFileSync(join(agentsDir, 'grimoire.typescript-coder.md'), '---\nname: grimoire.typescript-coder\n---\nprompt');

    const subDir = join(projectDir, 'sess-1', 'subagents');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, 'agent-ag1.meta.json'), JSON.stringify({ agentType: 'grimoire.typescript-coder', description: 'ts work' }));
    writeFileSync(join(subDir, 'agent-ag1.jsonl'), [
      JSON.stringify({ type: 'assistant', timestamp: '2026-07-01T10:00:00.000Z', message: { model: 'claude-opus-4-8', usage: { output_tokens: 40 }, content: [{ type: 'tool_use', name: 'Read', input: { file_path: 'a.ts' } }] } }),
      'corrupt line that must not crash the parse',
      JSON.stringify({ type: 'assistant', timestamp: '2026-07-01T10:00:05.000Z', message: { content: [{ type: 'text', text: 'done' }] } }),
    ].join('\n'));

    // A built-in agent run (no definition file) must not appear in the insights
    writeFileSync(join(subDir, 'agent-ag2.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'search' }));
    writeFileSync(join(subDir, 'agent-ag2.jsonl'), JSON.stringify({ type: 'assistant', timestamp: '2026-07-01T10:01:00.000Z', message: { content: [{ type: 'text', text: 'found it' }] } }));

    server = await runLogs(projectDir, { open: false, transcripts: '.' });

    const res = await fetch(`${serverUrl(server)}/api/insights`);
    expect(res.status).toBe(200);
    const body = await res.json() as { agents: Array<Record<string, unknown>>; invocations: Array<Record<string, unknown>> };
    expect(body.invocations).toHaveLength(1);
    expect(body.agents).toHaveLength(1);
    const agent = body.agents[0]!;
    expect(agent['agentType']).toBe('grimoire.typescript-coder');
    expect(agent['invocations']).toBe(1);
    expect((agent['toolMix'] as Record<string, number>)['Read']).toBe(1);
    expect(body.invocations[0]!['agentType']).toBe('grimoire.typescript-coder');
  });

  it('should return 404 for unknown routes', async () => {
    projectDir = makeTmpDir('notfound');
    setupLogFile('{"event":"test"}\n');

    server = await runLogs(projectDir, { open: false });

    const res = await fetch(`${serverUrl(server)}/unknown`);
    expect(res.status).toBe(404);
  });

  it('should return SSE headers for /api/logs/stream', async () => {
    projectDir = makeTmpDir('sse-headers');
    setupLogFile('{"event":"test"}\n');

    server = await runLogs(projectDir, { open: false });

    const controller = new AbortController();
    const res = await fetch(`${serverUrl(server)}/api/logs/stream`, {
      signal: controller.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toBe('no-cache');
    controller.abort();
  });

  it('should send initial log data via SSE stream', async () => {
    projectDir = makeTmpDir('sse-initial');
    setupLogFile('{"event":"initial"}\n');

    server = await runLogs(projectDir, { open: false });

    const controller = new AbortController();
    const res = await fetch(`${serverUrl(server)}/api/logs/stream`, {
      signal: controller.signal,
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    const { value } = await reader.read();
    const text = decoder.decode(value);

    expect(text).toContain('data:');
    expect(text).toContain('"event":"initial"');
    controller.abort();
  });

  it('should stream new entries when log file is appended', async () => {
    projectDir = makeTmpDir('sse-append');
    const logPath = setupLogFile('{"line":1}\n');

    server = await runLogs(projectDir, { open: false });

    const controller = new AbortController();
    const res = await fetch(`${serverUrl(server)}/api/logs/stream`, {
      signal: controller.signal,
    });
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read initial data
    const { value: initial } = await reader.read();
    expect(decoder.decode(initial)).toContain('"line":1');

    // Append new data and wait for poll
    appendFileSync(logPath, '{"line":2}\n');
    await new Promise(r => setTimeout(r, 1500));

    const { value: update } = await reader.read();
    expect(decoder.decode(update)).toContain('"line":2');

    controller.abort();
  });
});
