import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, realpathSync, rmSync, writeFileSync, appendFileSync, chmodSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Server } from 'node:http';
import { runLogs } from '../src/commands/logs.js';

function makeTmpDir(label: string): string {
  const raw = join(tmpdir(), `claudify-logs-${label}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
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
      : join(projectDir, '.claude', 'logs', 'skill-router.log');
    mkdirSync(join(logPath, '..'), { recursive: true });
    writeFileSync(logPath, content);
    return logPath;
  }

  it('should throw when log file is missing', async () => {
    projectDir = makeTmpDir('missing');

    await expect(
      runLogs(projectDir, { open: false }),
    ).rejects.toThrow(/log file not found/i);
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
    expect(body).toContain('Skill Router');
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
