# Skill Router

Automatically activates relevant skills based on context. Supports three hook events:

- **UserPromptSubmit** — matches skills to user prompts
- **SubagentStart** — injects skills into agents based on agent type
- **PreToolUse** — injects skills before Edit/Write tool calls based on file paths

## How It Works

### Prompt Mode (UserPromptSubmit)

1. User submits a prompt
2. Router extracts signals: words, file extensions, file paths
3. Each skill is scored against signals using weighted matching
4. Skills exceeding `activation_threshold` are injected into LLM context

### Tool Mode (PreToolUse)

1. Claude is about to call Edit or Write on a file
2. Router extracts signals from `file_path`: extension, path segments, keywords
3. Skills are scored using keyword, extension, and path matching (patterns are skipped)
4. Skills exceeding `pretooluse_threshold` are injected before the tool executes
5. Always non-blocking (`permissionDecision: 'allow'`)

## Configuration

Edit `.claude/skills-manifest.json`:

```json
{
  "version": "1.0.0",
  "config": {
    "weights": {
      "keywords": 1.0,
      "file_extensions": 1.5,
      "patterns": 2.0,
      "file_paths": 2.5
    },
    "activation_threshold": 3.0,
    "pretooluse_threshold": 1.5,
    "log_path": ".claude/logs/skill-router.log"
  },
  "skills": [...]
}
```

### Weights

| Type | Default | Description |
|------|---------|-------------|
| `keywords` | 1.0 | Word matches (exact, stem, or fuzzy at 0.8× discount) |
| `file_extensions` | 1.5 | File type signals (.ts, .pdf) |
| `patterns` | 2.0 | Regex pattern matches |
| `file_paths` | 2.5 | Path prefix matches |

### Skill Definition

```json
{
  "path": ".claude/skills/my-skill",
  "name": "My Skill",
  "description": "What this skill does",
  "triggers": {
    "keywords": ["word1", "word2"],
    "file_extensions": [".ts", ".js"],
    "patterns": ["create.*feature", "implement.*api"],
    "file_paths": ["src/", "tests/"]
  }
}
```

## Tuning

Two separate thresholds control activation:

| Threshold | Default | Used by |
|-----------|---------|---------|
| `activation_threshold` | 3.0 | UserPromptSubmit, SubagentStart |
| `pretooluse_threshold` | 1.5 | PreToolUse (Edit/Write) |

The PreToolUse threshold is lower because tool inputs yield fewer signals — a single file extension match (weight 1.5) is often sufficient.

### Keyword Matching

Keywords use a three-tier matching priority:

1. **Exact** — word appears verbatim in prompt → full weight
2. **Stem** — word form matches after suffix stripping (e.g., "testing" matches keyword "test") → full weight
3. **Fuzzy** — Levenshtein distance within threshold (e.g., "reveiw" matches "review") → weight × 0.8

Fuzzy thresholds by keyword length: no fuzzy for 1–3 chars, max distance 1 for 4–5 chars, max distance 2 for 6+ chars. Short keywords are protected from false positives.

The `matchQuality` field (`exact`, `stem`, or `fuzzy`) appears in log entries for debugging.

**Threshold too high?** Skills won't activate. Lower the relevant threshold.

**Threshold too low?** Too many skills activate. Raise the relevant threshold.

**Skill not activating?** Check:
- Keywords are lowercase
- Patterns use valid regex
- File paths end with `/` for directories

## Logs

Open the interactive log viewer dashboard with real-time streaming:
```bash
grimoire logs
```

New entries appear live as skills activate (green "LIVE" indicator). Or view raw log entries:
```bash
tail -20 .claude/logs/skill-router.log | jq .
```

Log entry fields:
- `prompt_raw`: Original prompt (truncated to 500 chars), or `[PreToolUse:<tool>] <path>` for tool events
- `skills_matched`: Array of matched skills with scores
- `outcome`: `activated` | `no_match` | `error`
- `execution_time_ms`: Processing time
- `hook_event`: `PreToolUse` (only present for tool events)
- `tool_name`: `Edit` | `Write` (only present for tool events)

## Troubleshooting

**Router not running?**
- Check `.claude/settings.json` has the relevant hook (UserPromptSubmit, SubagentStart, or PreToolUse)
- For PreToolUse, verify the matcher is `Edit|Write`
- Verify `npx tsx` is available

**Skills not matching?**
- Review log file for `no_match` entries
- Check `signals_extracted` in log to see what was detected
- Verify skill triggers match expected signals
- For PreToolUse: only keywords, extensions, and file_paths fire — patterns are skipped
- Check `matchQuality` in log — stem/fuzzy matches may score lower than expected

**Unexpected skill activations?**
- Fuzzy matching may match similar words — check `matchQuality: "fuzzy"` in logs
- Use longer, more specific keywords to reduce false positives
- Short keywords (1–3 chars) are never fuzzy-matched

**Performance issues?**
- Check `execution_time_ms` in logs (should be <50ms)
- Reduce number of skills or simplify patterns
