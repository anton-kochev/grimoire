import { exec } from 'node:child_process';
import { closeSync, existsSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';
import { defaultArchiveRoot, loadInvocationById, loadMergedInvocations, resolveProjectDir } from '../transcripts.js';
import { listDefinedAgentTypes } from '../agent-defs.js';
import { analyze } from '../insights-analysis.js';
import { analyzeAgent } from '../agent-analysis.js';

export interface LogsOptions {
  readonly logFile?: string | undefined;
  readonly port?: number | undefined;
  readonly open?: boolean;
  /** Override the transcript project dir (containing `<session>/subagents/…`). Mainly for tests. */
  readonly transcripts?: string | undefined;
  /** Override the archived-sessions root (`.claude/grimoire/sessions`). Mainly for tests. */
  readonly sessions?: string | undefined;
}

const DEFAULT_LOG_PATH = '.claude/logs/grimoire-router.log';
const DEFAULT_MANIFEST_PATH = '.claude/grimoire.json';

/**
 * Builds the factual Agent Insights payload by parsing Claude Code sub-agent
 * transcripts. Interpretation is done separately (on demand) by `/api/analyze`.
 * Never throws — missing data degrades to an empty result.
 */
/** Resolves the live transcript dir and the archived-sessions root, or null when absent. */
function resolveInsightSources(
  cwd: string,
  transcriptsOverride?: string,
  sessionsOverride?: string,
): { liveDir: string | null; archiveDir: string | null } {
  const live = transcriptsOverride ? resolve(cwd, transcriptsOverride) : resolveProjectDir(cwd);
  const archive = sessionsOverride ? resolve(cwd, sessionsOverride) : defaultArchiveRoot(cwd);
  return {
    liveDir: live && existsSync(live) ? live : null,
    archiveDir: existsSync(archive) ? archive : null,
  };
}

export function buildInsights(cwd: string, transcriptsOverride?: string, sessionsOverride?: string): Record<string, unknown> {
  const generatedAt = new Date().toISOString();
  const { liveDir, archiveDir } = resolveInsightSources(cwd, transcriptsOverride, sessionsOverride);

  if (!liveDir && !archiveDir) {
    return { agents: [], invocations: [], projectDir: null, note: 'No sub-agent transcripts found for this project.', generatedAt };
  }

  // Built-in agents (Explore, Plan, …) have no editable definition — skip them.
  const defined = listDefinedAgentTypes(cwd);
  const invocations = loadMergedInvocations(liveDir, archiveDir).filter((i) => defined.has(i.agentType));
  const agents = analyze(invocations);
  // The full per-run timeline is heavy — strip it here; the viewer fetches it on
  // demand per invocation via GET /api/invocations/<agentId>.
  const summaries = invocations.map(({ timeline, ...rest }) => rest);
  return { agents, invocations: summaries, projectDir: liveDir ?? archiveDir, generatedAt };
}

/** Reads a request body up to a size cap. */
function readBody(req: import('node:http').IncomingMessage, cap = 1_000_000): Promise<string> {
  return new Promise((resolveBody) => {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > cap) req.destroy();
    });
    req.on('end', () => resolveBody(body));
    req.on('error', () => resolveBody(''));
  });
}

export async function runLogs(cwd: string, options: LogsOptions = {}): Promise<Server> {
  const logFilePath = options.logFile
    ? resolve(cwd, options.logFile)
    : resolve(cwd, DEFAULT_LOG_PATH);

  // The viewer needs at least one data source: live sub-agent transcripts or the
  // archived sessions (Insights tab), or the enforcement log (Events tab). Bail
  // only if none exists.
  const liveDir = options.transcripts ? resolve(cwd, options.transcripts) : resolveProjectDir(cwd);
  const hasTranscripts = !!liveDir && existsSync(liveDir);
  const archiveDir = options.sessions ? resolve(cwd, options.sessions) : defaultArchiveRoot(cwd);
  const hasArchive = existsSync(archiveDir);
  if (!existsSync(logFilePath) && !hasTranscripts && !hasArchive) {
    console.error('No Grimoire data found for this project yet.\n');
    console.error(`Looked for sub-agent transcripts and an enforcement log at:`);
    console.error(`  transcripts: ~/.claude/projects/<this project>/*/subagents/`);
    console.error(`  archive:     ${archiveDir}`);
    console.error(`  enforce log: ${logFilePath}\n`);
    console.error('Run some sub-agents (or enable enforcement: grimoire config), then try again.');
    process.exit(1);
  }

  const htmlPath = resolve(import.meta.dirname, '..', 'static', 'log-viewer.html');
  const html = readFileSync(htmlPath, 'utf-8');

  const server = createServer((req, res) => {
    if (req.url === '/' || req.url === '/index.html') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    if (req.url === '/api/logs') {
      try {
        const logData = readFileSync(logFilePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' });
        res.end(logData);
      } catch {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Failed to read log file');
      }
      return;
    }

    if (req.url === '/api/insights') {
      try {
        const payload = buildInsights(cwd, options.transcripts, options.sessions);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(payload));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'insights failed' }));
      }
      return;
    }

    if (req.url && req.url.startsWith('/api/invocations/')) {
      try {
        const agentId = decodeURIComponent(req.url.slice('/api/invocations/'.length));
        const { liveDir, archiveDir } = resolveInsightSources(cwd, options.transcripts, options.sessions);
        const inv = agentId ? loadInvocationById(liveDir, archiveDir, agentId) : null;
        if (!inv) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'invocation not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(inv));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'invocation failed' }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/api/analyze') {
      void (async () => {
        try {
          const parsed = JSON.parse((await readBody(req)) || '{}') as { agentType?: unknown; model?: unknown };
          const agentType = typeof parsed.agentType === 'string' ? parsed.agentType : '';
          if (!agentType) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ ok: false, error: 'agentType is required' }));
            return;
          }
          const result = analyzeAgent(cwd, agentType, {
            transcripts: options.transcripts,
            sessions: options.sessions,
            model: typeof parsed.model === 'string' ? parsed.model : undefined,
          });
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(result));
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: err instanceof Error ? err.message : 'analyze failed' }));
        }
      })();
      return;
    }

    if (req.url === '/api/manifest') {
      const manifestPath = resolve(cwd, DEFAULT_MANIFEST_PATH);
      try {
        const data = readFileSync(manifestPath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      } catch {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Manifest not found');
      }
      return;
    }

    if (req.url === '/api/logs/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      let offset = 0;

      const sendChunk = (text: string) => {
        if (!text.trim()) return;
        const encoded = text.split('\n').map(l => `data: ${l}`).join('\n');
        res.write(`${encoded}\n\n`);
      };

      // Send initial content
      try {
        const content = readFileSync(logFilePath, 'utf-8');
        offset = Buffer.byteLength(content, 'utf-8');
        sendChunk(content);
      } catch { /* file may be empty */ }

      // Poll for new data
      const watcher = setInterval(() => {
        try {
          const stat = statSync(logFilePath);
          if (stat.size > offset) {
            const fd = openSync(logFilePath, 'r');
            const buf = Buffer.alloc(stat.size - offset);
            readSync(fd, buf, 0, buf.length, offset);
            closeSync(fd);
            offset = stat.size;
            sendChunk(buf.toString('utf-8'));
          } else if (stat.size < offset) {
            // File was truncated — reset
            res.write('event: reset\ndata: \n\n');
            const content = readFileSync(logFilePath, 'utf-8');
            offset = Buffer.byteLength(content, 'utf-8');
            if (content.trim()) sendChunk(content);
          }
        } catch { /* file temporarily unavailable */ }
      }, 1000);

      const heartbeat = setInterval(() => {
        res.write(':heartbeat\n\n');
      }, 15000);

      req.on('close', () => {
        clearInterval(watcher);
        clearInterval(heartbeat);
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  const port = options.port ?? 0;
  const shouldOpen = options.open ?? true;

  return new Promise<Server>((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        const url = `http://127.0.0.1:${addr.port}`;
        if (shouldOpen) {
          openBrowser(url);
        }
      }
      resolve(server);
    });
  });
}

function openBrowser(url: string): void {
  const cmd =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start' :
    'xdg-open';
  exec(`${cmd} ${url}`);
}
