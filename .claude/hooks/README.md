# Skill Router

Automatically activates relevant skills based on user prompt content.

## How It Works

1. User submits a prompt
2. Router extracts signals: words, file extensions, file paths
3. Each skill is scored against signals using weighted matching
4. Skills exceeding threshold are injected into LLM context

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
    "log_path": ".claude/logs/skill-router.log"
  },
  "skills": [...]
}
```

### Weights

| Type | Default | Description |
|------|---------|-------------|
| `keywords` | 1.0 | Exact word matches |
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

**Threshold too high?** Skills won't activate. Lower `activation_threshold`.

**Threshold too low?** Too many skills activate. Raise `activation_threshold`.

**Skill not activating?** Check:
- Keywords are lowercase
- Patterns use valid regex
- File paths end with `/` for directories

## Logs

View recent activations:
```bash
tail -20 .claude/logs/skill-router.log | jq .
```

Log entry fields:
- `prompt_raw`: Original prompt (truncated to 500 chars)
- `skills_matched`: Array of matched skills with scores
- `outcome`: `activated` | `no_match` | `error`
- `execution_time_ms`: Processing time

## Troubleshooting

**Router not running?**
- Check `.claude/settings.json` has UserPromptSubmit hook
- Verify `npx tsx` is available

**Skills not matching?**
- Review log file for `no_match` entries
- Check `signals_extracted` in log to see what was detected
- Verify skill triggers match expected signals

**Performance issues?**
- Check `execution_time_ms` in logs (should be <50ms)
- Reduce number of skills or simplify patterns
