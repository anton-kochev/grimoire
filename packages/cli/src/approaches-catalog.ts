/**
 * Built-in catalog of enforced approaches: predefined binding directives a
 * user can attach to agents (check/uncheck in `grimoire list` → Manage
 * approaches, or `grimoire agent-approaches`). The directive text is copied
 * into `.claude/grimoire.json` at attach time, so the router never needs
 * this catalog. `skillMatch` drives per-agent skill binding: the same
 * approach binds `grimoire.unit-testing-dotnet` on a C# agent and
 * `grimoire.unit-testing-typescript` on a TypeScript agent.
 */

export interface ApproachDefinition {
  /** Stored as `name` in grimoire.json approach entries. */
  id: string;
  /** Multiselect label. */
  label: string;
  /** Multiselect hint. */
  description: string;
  /** Full binding directive text injected at SubagentStart. */
  directive: string;
  /** Case-insensitive substrings matched against skill names for binding. */
  skillMatch?: readonly string[];
}

export const APPROACHES_CATALOG: readonly ApproachDefinition[] = [
  {
    id: 'tdd',
    label: 'Test-Driven Development',
    description: 'failing test first; implement only to make it pass',
    directive:
      'Follow Test-Driven Development for every behavioral change: write or update a failing ' +
      'test FIRST, watch it fail, implement the minimal code to make it pass, then refactor. ' +
      'Never write implementation code without a failing test demanding it. Keep the whole ' +
      'suite green before finishing.',
    skillMatch: ['unit-testing', 'tdd'],
  },
  {
    id: 'clean-architecture',
    label: 'Clean Architecture',
    description: 'dependencies point inward; domain stays framework-free',
    directive:
      "Respect the project's architectural layering: dependencies point inward only, domain " +
      'logic stays framework-free, and use cases never leak infrastructure concerns. Do not ' +
      'introduce shortcuts across layer boundaries.',
    skillMatch: ['clean-architecture'],
  },
  {
    id: 'docs-first',
    label: 'Docs first',
    description: 'update business-logic docs before changing behavior',
    directive:
      'Locate and update the relevant business-logic documentation before changing behavior. ' +
      'If no documentation exists for the affected area, state that explicitly in your summary.',
    skillMatch: ['business-logic-docs'],
  },
  {
    id: 'modern-csharp',
    label: 'Modern C# code',
    description: 'current C#/.NET idioms in every touched file',
    directive:
      'Apply current C#/.NET idioms to every C# file you touch: honor nullable reference ' +
      'types, use records for immutable data, prefer pattern matching where it clarifies, ' +
      'write correct async/await with cancellation tokens (never sync-over-async), and keep ' +
      'hot paths allocation-aware.',
    skillMatch: ['modern-csharp'],
  },
  {
    id: 'dotnet-web-api',
    label: '.NET Web API best practices',
    description: 'ASP.NET Core routing, validation, ProblemDetails, TypedResults',
    directive:
      'Follow ASP.NET Core best practices for every endpoint you add or change: proper ' +
      'routing and model binding, request validation, ProblemDetails for error responses, ' +
      'TypedResults, and fully async handlers with cancellation support.',
    skillMatch: ['dotnet-web-api'],
  },
  {
    id: 'modern-typescript',
    label: 'Modern TypeScript code',
    description: 'strict TS: no any, discriminated unions, precise generics',
    directive:
      'Write strict modern TypeScript: no `any`, discriminated unions for state and results, ' +
      'precise generics and narrowing, and code that compiles clean under strict mode.',
    skillMatch: ['modern-typescript'],
  },
  {
    id: 'dotnet-compile-time-logging',
    label: '.NET compile-time logging',
    description: 'all logging via the LoggerMessage source generator',
    directive:
      'Route all logging in .NET code through the compile-time LoggerMessage source ' +
      'generator. Never use string-interpolated or ad-hoc ILogger calls.',
    skillMatch: ['modern-csharp'],
  },
];

export function findApproach(id: string): ApproachDefinition | undefined {
  return APPROACHES_CATALOG.find((d) => d.id === id);
}
