import { createServer, type Server } from 'node:http';
import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve } from 'node:path';
import { exec } from 'node:child_process';

export interface LogsOptions {
  readonly logFile?: string | undefined;
  readonly port?: number | undefined;
  readonly open?: boolean;
}

const DEFAULT_LOG_PATH = '.claude/logs/skill-router.log';
const DEFAULT_MANIFEST_PATH = '.claude/skills-manifest.json';

export async function runLogs(cwd: string, options: LogsOptions = {}): Promise<Server> {
  const logFilePath = options.logFile
    ? resolve(cwd, options.logFile)
    : resolve(cwd, DEFAULT_LOG_PATH);

  // Validate log file exists up front
  if (!existsSync(logFilePath)) {
    console.error(`Log file not found: ${logFilePath}\n`);
    console.error('The skill-router has not produced any logs yet.');
    console.error('Logs are created after the skill-router hook runs for the first time.\n');
    console.error('To get started:');
    console.error('  1. Install a pack with auto-activation: grimoire add <pack> --enable-auto-activation');
    console.error('  2. Open Claude Code in the project and send a prompt');
    console.error('  3. Run this command again');
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
