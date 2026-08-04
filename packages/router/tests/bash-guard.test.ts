import { describe, it, expect } from 'vitest';
import {
  bashCandidatePaths,
  commandHead,
  isReadOnlySegment,
  pathTokens,
  redirectTargets,
  splitSegments,
} from '../src/bash-guard.js';

describe('splitSegments', () => {
  it('splits on &&, ||, ;, | and newlines', () => {
    expect(splitSegments('a && b || c ; d | e')).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(splitSegments('a\nb')).toEqual(['a', 'b']);
  });

  it('returns a single segment for a plain command', () => {
    expect(splitSegments('rg TryAddAsync src/Cache.cs')).toEqual(['rg TryAddAsync src/Cache.cs']);
  });

  it('drops empty segments', () => {
    expect(splitSegments('a ;; b')).toEqual(['a', 'b']);
    expect(splitSegments('   ')).toEqual([]);
  });
});

describe('commandHead', () => {
  it('returns the first word', () => {
    expect(commandHead('rg foo bar')).toBe('rg');
  });

  it('skips leading env assignments', () => {
    expect(commandHead('FOO=bar BAZ=qux python -c "x"')).toBe('python');
  });

  it('skips sudo, command and env wrappers', () => {
    expect(commandHead('sudo sed -i s/a/b/ f.cs')).toBe('sed');
    expect(commandHead('command tee f.cs')).toBe('tee');
    expect(commandHead('env python3 -c "x"')).toBe('python3');
  });

  it('strips a directory prefix from the head', () => {
    expect(commandHead('/usr/bin/sed -i s/a/b/ f.cs')).toBe('sed');
  });

  it('returns an empty string for a blank segment', () => {
    expect(commandHead('   ')).toBe('');
  });
});

describe('isReadOnlySegment', () => {
  it('accepts read-only search and inspection commands', () => {
    for (const cmd of ['rg foo', 'grep -n foo f.cs', 'cat f.cs', 'ls -la', 'wc -l f.cs']) {
      expect(isReadOnlySegment(cmd)).toBe(true);
    }
  });

  it('accepts test and build runners', () => {
    for (const cmd of [
      'dotnet test tests/Foo.Tests/Foo.Tests.csproj',
      'cargo test --test integration',
      'pnpm vitest run src/foo.test.ts',
    ]) {
      expect(isReadOnlySegment(cmd)).toBe(true);
    }
  });

  it('rejects known mutators', () => {
    for (const cmd of ['sed -i s/a/b/ f.cs', 'python -c "x"', 'tee f.cs', 'cp a.cs b.cs']) {
      expect(isReadOnlySegment(cmd)).toBe(false);
    }
  });

  it('accepts safe git subcommands and rejects working-tree rewrites', () => {
    expect(isReadOnlySegment('git status')).toBe(true);
    expect(isReadOnlySegment('git diff src/Cache.cs')).toBe(true);
    expect(isReadOnlySegment('git commit -m "fix Cache.cs"')).toBe(true);

    expect(isReadOnlySegment('git checkout -- src/Cache.cs')).toBe(false);
    expect(isReadOnlySegment('git restore src/Cache.cs')).toBe(false);
    expect(isReadOnlySegment('git apply patch.diff')).toBe(false);
  });

  it('treats a bare git as not read-only', () => {
    expect(isReadOnlySegment('git')).toBe(false);
  });

  it('fails closed on an assignment-only fragment', () => {
    // Left behind when a quoted payload containing `;` is over-split — it
    // carries the path, so it must not read as read-only.
    expect(isReadOnlySegment("p='src/Cache.cs'")).toBe(false);
  });
});

describe('redirectTargets', () => {
  it('extracts targets of > and >> with and without a space', () => {
    expect(redirectTargets('cat a > src/Foo.cs')).toContain('src/Foo.cs');
    expect(redirectTargets('cat a >src/Foo.cs')).toContain('src/Foo.cs');
    expect(redirectTargets('cat a >> src/Foo.cs')).toContain('src/Foo.cs');
  });

  it('extracts quoted redirect targets', () => {
    expect(redirectTargets('cat a > "src/My Foo.cs"')).toContain('src/My Foo.cs');
    expect(redirectTargets("cat a > 'src/Foo.cs'")).toContain('src/Foo.cs');
  });

  it('extracts tee targets', () => {
    expect(redirectTargets('tee src/Foo.cs')).toContain('src/Foo.cs');
    expect(redirectTargets('tee -a src/Foo.cs')).toContain('src/Foo.cs');
  });

  it('ignores fd duplication and comparison operators', () => {
    expect(redirectTargets('cmd 2>&1')).toEqual([]);
    expect(redirectTargets('cmd < input.txt')).toEqual([]);
  });

  it('returns nothing when there is no redirect', () => {
    expect(redirectTargets('rg foo src/Cache.cs')).toEqual([]);
  });
});

describe('pathTokens', () => {
  it('pulls a path out of a python string literal', () => {
    expect(pathTokens(`python -c "open('src/Cache.cs','w')"`)).toContain('src/Cache.cs');
  });

  it('pulls a path out of double and single quotes', () => {
    expect(pathTokens(`sed -i '' 's/a/b/' "src/Cache.cs"`)).toContain('src/Cache.cs');
    expect(pathTokens(`cp 'src/Cache.cs' /tmp/x`)).toContain('src/Cache.cs');
  });

  it('separates comma- and paren-adjacent tokens', () => {
    const tokens = pathTokens(`f(a.cs, b.cs)`);
    expect(tokens).toContain('a.cs');
    expect(tokens).toContain('b.cs');
  });

  it('drops flags and empty fragments', () => {
    const tokens = pathTokens('sed -i s/a/b/ f.cs');
    expect(tokens).not.toContain('-i');
    expect(tokens).toContain('f.cs');
  });
});

describe('bashCandidatePaths', () => {
  it('returns the target of the observed python -c bypass', () => {
    const cmd = `python3 -c "import re;p='src/Cache.cs';s=open(p).read();open(p,'w').write(s)"`;
    expect(bashCandidatePaths(cmd)).toContain('src/Cache.cs');
  });

  it('returns nothing for a read-only command that names an owned file', () => {
    expect(bashCandidatePaths('rg TryAddAsync src/Cache.cs')).toEqual([]);
    expect(bashCandidatePaths('git diff src/Cache.cs')).toEqual([]);
  });

  it('still catches a redirect behind a read-only head', () => {
    expect(bashCandidatePaths('cat template > src/Cache.cs')).toContain('src/Cache.cs');
    expect(bashCandidatePaths('jq . a.json > src/Cache.cs')).toContain('src/Cache.cs');
  });

  it('inspects every segment of a chained command', () => {
    const paths = bashCandidatePaths('rg foo src/A.cs && sed -i s/x/y/ src/B.cs');
    expect(paths).not.toContain('src/A.cs');
    expect(paths).toContain('src/B.cs');
  });

  it('catches the write half of a pipe chain', () => {
    const paths = bashCandidatePaths('cat src/A.cs | python -c "..." > src/B.cs');
    expect(paths).toContain('src/B.cs');
  });

  it('catches mv/cp restoring over an owned file', () => {
    expect(bashCandidatePaths('mv /tmp/patched src/Cache.cs')).toContain('src/Cache.cs');
    expect(bashCandidatePaths('git checkout -- src/Cache.cs')).toContain('src/Cache.cs');
  });

  it('returns nothing for an empty or whitespace command', () => {
    expect(bashCandidatePaths('')).toEqual([]);
    expect(bashCandidatePaths('   ')).toEqual([]);
  });

  it('deduplicates repeated paths', () => {
    const paths = bashCandidatePaths(`python -c "open('a.cs');open('a.cs','w')"`);
    expect(paths.filter((p) => p === 'a.cs')).toHaveLength(1);
  });
});
