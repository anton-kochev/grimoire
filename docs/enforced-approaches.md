# Enforced Approaches — User Guide

Make your agents actually follow a methodology, not just have access to one.

## The problem

Assigning a skill to an agent (`grimoire agent-skills`) makes it *available* — the skill shows up in the agent's catalog, and the agent *may* load it. That's the right behavior for skills: they describe how to do something. But nothing obliges the agent to use them. Assign a TDD skill to your C# architect and it will happily write implementation code first anyway.

An **approach** closes that gap. It's a binding directive attached to an agent — "this agent follows Test-Driven Development" — and grimoire's router makes it stick.

## How it works

When an agent with attached approaches runs:

1. **At start** — the router injects a mandate into the agent's context *before its first prompt*:

   ```
   ## Grimoire: enforced approaches

   You are running as "grimoire.csharp-coder". The approaches below are binding
   directives for this entire run. They are requirements, not suggestions; ...

   ### 1. tdd
   Directive: Follow Test-Driven Development for every behavioral change: ...
   Required skill: As your FIRST action, before any other tool use, invoke the
   Skill tool with skill "grimoire.unit-testing-dotnet", then adhere to it ...
   ```

2. **At finish** — the router checks compliance. If the run **edited files** but never loaded the bound skill, the agent is sent back with corrective feedback (load the skill, review every edit against it, fix violations) and keeps working instead of finishing. This happens at most **once per run**; cancelled or errored runs are never bounced.

What it deliberately does **not** do:

- No tool blocking — the agent is never denied an edit mid-run.
- No coupling to the `enforcement` toggle — that flag governs file ownership only. Attaching an approach is itself the opt-in.

## Quick start

```bash
grimoire list
```

Select an agent → **Manage approaches** → check what you want enforced (space toggles, enter confirms). Or use the standalone command:

```bash
grimoire agent-approaches
```

When you check a skill-described approach (like TDD), grimoire binds the agent's matching skill:

- exactly one matching skill already assigned to the agent → bound silently;
- otherwise you pick from matching installed skills (or "none — enforce the directive only");
- if the bound skill isn't in the agent's `skills:` list yet, grimoire offers to add it.

That's it — the required hooks are wired into `.claude/settings.local.json` automatically. Unchecking an approach removes it (and cleans up hooks when nothing needs them anymore).

## The catalog

| Approach | Enforces | Verified via skill matching |
|---|---|---|
| Test-Driven Development | failing test first, minimal code to green, refactor | `unit-testing`, `tdd` |
| Clean Architecture | dependencies inward, framework-free domain, no layer shortcuts | `clean-architecture` |
| Docs first | update business-logic docs before changing behavior | `business-logic-docs` |
| Modern C# code | NRT, records, pattern matching, correct async/cancellation | `modern-csharp` |
| .NET Web API best practices | routing/binding, validation, ProblemDetails, TypedResults | `dotnet-web-api` |
| Modern TypeScript code | no `any`, discriminated unions, strict-mode-clean | `modern-typescript` |
| .NET compile-time logging | LoggerMessage source generator only | `modern-csharp` |

Approaches are agent-independent: the same TDD checkbox binds `grimoire.unit-testing-dotnet` on `csharp-coder` and `grimoire.unit-testing-typescript` on `typescript-coder`. An approach with no matching skill installed still injects its directive — only the finish-verification is disabled.

## Checking that it's working

Watch the router log after delegating work to the agent:

```bash
tail -5 .claude/logs/grimoire-router.log | jq .
```

- The start row shows `"approaches_enforced": ["tdd"]`.
- The stop row shows `"approach_check"`: `"passed"` (bound skill was loaded), `"bounced"` (sent back for rework, with `"approach_violations"`), or `"skipped"` (nothing to verify — read-only run, cancelled/errored stop, or already bounced once).

`grimoire logs` shows the same events in the viewer, and the Insights tab shows whether the run invoked its skills.

## Configuration reference

Attached approaches live in `.claude/grimoire.json`:

```json
{
  "router": {
    "agents": {
      "grimoire.csharp-coder": {
        "approaches": [
          {
            "name": "tdd",
            "directive": "Follow Test-Driven Development for every behavioral change: ...",
            "skill": "grimoire.unit-testing-dotnet"
          }
        ]
      }
    }
  }
}
```

The config is self-contained — the directive text is stored in full, so you can hand-tune it, or hand-add a **custom approach** (any `name` + `directive`, optional `skill`) that isn't in the catalog. Custom entries show up in the manage flow and can be unchecked like any other. Malformed entries are ignored silently; hooks never fail over configuration.

## Good to know

- **The agent needs the `Skill` tool.** If its frontmatter `tools:` list omits `Skill`, it can't load the bound skill — grimoire warns you at attach time.
- **Read-only runs aren't bounced.** An agent that only analyzed code and made no edits finishes normally, even without loading the skill.
- **One bounce per run, by design.** The feedback is marked in the transcript; a run that ignores it once isn't ping-ponged forever.
- **Disabling `enforcement` doesn't touch approaches.** Their hooks survive the toggle; remove an approach by unchecking it.
- **Removing the agent removes its approaches** along with the rest of its config entry.
