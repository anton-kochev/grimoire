/**
 * Bash write-path detection for ownership enforcement.
 *
 * The PreToolUse ownership hook originally saw only Edit/Write/MultiEdit, which
 * left the shell as an unguarded write path: an agent denied an edit could
 * reach the same file through `sed -i`, `python -c`, a `>` redirect, or `mv`.
 *
 * The strategy here is deliberately conservative. Commands whose head cannot
 * write files pass untouched; everything else contributes *every* path-like
 * token it mentions as a candidate for the ownership check. Naming an owned
 * file anywhere in a mutating command is enough to be blocked — which is what
 * makes a path buried in a Python string literal catchable without parsing
 * Python. False positives fail toward "delegate to the owner", the behavior
 * enforcement wants anyway.
 *
 * This raises the cost of a bypass and makes attempts visible; it is not a
 * sandbox. Paths assembled from shell variables, `$(...)` substitution, or an
 * indirection through a helper script written elsewhere are accepted misses.
 */

/**
 * Command heads that read files but never write them. Kept tight on purpose:
 * the list only matters for commands that legitimately *name* an owned file,
 * since anything not mentioning one passes regardless.
 */
const READ_ONLY_HEADS: ReadonlySet<string> = new Set([
  // search / inspect
  'grep', 'rg', 'ag', 'ack', 'cat', 'bat', 'head', 'tail', 'less', 'more',
  'ls', 'find', 'fd', 'wc', 'file', 'stat', 'diff', 'cmp', 'which', 'type',
  'pwd', 'basename', 'dirname', 'realpath', 'readlink', 'tree', 'du', 'md5sum',
  // test / build runners that routinely take source paths as arguments
  'cargo', 'dotnet', 'npm', 'pnpm', 'yarn', 'vitest', 'jest', 'pytest',
  'go', 'make', 'mvn', 'gradle', 'tsc', 'eslint',
]);

/**
 * git subcommands that never rewrite working-tree file contents. `add`,
 * `commit` and `push` qualify — they move history, not files. The mutators
 * left out on purpose: checkout, restore, apply, reset, clean, stash, revert,
 * merge, rebase, cherry-pick.
 */
const SAFE_GIT_SUBCOMMANDS: ReadonlySet<string> = new Set([
  'status', 'diff', 'log', 'show', 'blame', 'branch', 'remote', 'rev-parse',
  'ls-files', 'describe', 'shortlog', 'config', 'add', 'commit', 'push', 'fetch',
]);

/** Wrappers that delegate to the real command that follows them. */
const HEAD_WRAPPERS: ReadonlySet<string> = new Set(['sudo', 'command', 'env', 'nohup', 'time', 'exec']);

/** `FOO=bar` prefixes that precede the actual command. */
const ENV_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/**
 * Splits a command into independently-analyzed segments on `&&`, `||`, `;`,
 * `|` and newlines. This is not a shell parser — an operator inside quotes
 * splits too. That over-splits, which is safe: more segments means more
 * candidate tokens checked, never fewer.
 */
export function splitSegments(command: string): string[] {
  return command
    .split(/(?:\|\||&&|[;|\n])+/)
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

/**
 * The segment's effective command name: the first real word with env
 * assignments and wrappers skipped and any directory prefix stripped, so
 * `/usr/bin/sed` and `sudo sed` both read as `sed`.
 */
export function commandHead(segment: string): string {
  const words = segment.trim().split(/\s+/).filter(Boolean);
  for (const word of words) {
    if (ENV_ASSIGNMENT.test(word)) continue;
    const bare = word.split('/').pop() ?? word;
    if (HEAD_WRAPPERS.has(bare)) continue;
    return bare;
  }
  return '';
}

/** True when the segment's head — and, for git, its subcommand — cannot write files. */
export function isReadOnlySegment(segment: string): boolean {
  const head = commandHead(segment);
  // No identifiable command — typically an assignment-only fragment left by
  // over-splitting a quoted payload (`python -c "…;p='Owned.cs';…"`). That
  // fragment carries the path, so it must fail closed, not open.
  if (head === '') return false;

  if (head === 'git') {
    const sub = segment
      .trim()
      .split(/\s+/)
      .filter((w) => !ENV_ASSIGNMENT.test(w))
      .filter((w) => !HEAD_WRAPPERS.has(w.split('/').pop() ?? w))
      .slice(1)
      .find((w) => !w.startsWith('-'));
    return sub !== undefined && SAFE_GIT_SUBCOMMANDS.has(sub);
  }

  return READ_ONLY_HEADS.has(head);
}

/**
 * Targets of `>` / `>>` and `tee`, extracted regardless of the head — a
 * read-only command still writes when its output is redirected
 * (`cat template > Owned.cs`). Skips `2>&1`-style fd duplication and `<` input.
 */
export function redirectTargets(segment: string): string[] {
  const targets: string[] = [];

  // > or >> optionally preceded by an fd number, not followed by & (fd dup)
  const redirect = /\d?>>?\s*(?!&)("([^"]+)"|'([^']+)'|([^\s|&;<>]+))/g;
  for (const m of segment.matchAll(redirect)) {
    const value = m[2] ?? m[3] ?? m[4];
    if (value) targets.push(value);
  }

  if (commandHead(segment) === 'tee') {
    const words = segment.trim().split(/\s+/).slice(1);
    for (const word of words) {
      if (word.startsWith('-')) continue;
      targets.push(stripQuotes(word));
    }
  }

  return targets;
}

function stripQuotes(token: string): string {
  return token.replace(/^["']|["']$/g, '');
}

/**
 * Every path-like token in a segment. Quotes, parens and commas are treated as
 * delimiters, so `open('src/Cache.cs','w')` yields `src/Cache.cs` with no
 * language-specific parsing.
 */
export function pathTokens(segment: string): string[] {
  return segment
    .split(/[\s'"`,()[\]{}<>|&;:=]+/)
    .filter((t) => t !== '' && !t.startsWith('-'));
}

/**
 * Candidate paths to run through the ownership check for a whole command.
 *
 * Per segment: redirect targets always count; a read-only segment contributes
 * nothing further, while any other segment contributes every token it mentions.
 */
export function bashCandidatePaths(command: string): string[] {
  const candidates = new Set<string>();

  for (const segment of splitSegments(command)) {
    for (const target of redirectTargets(segment)) {
      candidates.add(target);
    }
    if (isReadOnlySegment(segment)) continue;
    for (const token of pathTokens(segment)) {
      candidates.add(token);
    }
  }

  return [...candidates];
}
