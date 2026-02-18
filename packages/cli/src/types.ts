export interface PackSkillTriggers {
  readonly keywords: readonly string[];
  readonly file_extensions: readonly string[];
  readonly patterns: readonly string[];
  readonly file_paths: readonly string[];
}

export interface PackAgentEntry {
  readonly name: string;
  readonly path: string;
  readonly description: string;
}

export interface PackSkillEntry {
  readonly name: string;
  readonly path: string;
  readonly description: string;
  readonly triggers?: PackSkillTriggers | undefined;
}

export interface PackManifest {
  readonly name: string;
  readonly version: string;
  readonly agents: readonly PackAgentEntry[];
  readonly skills: readonly PackSkillEntry[];
}

export interface InstallItem {
  readonly type: 'agent' | 'skill';
  readonly name: string;
  readonly sourcePath: string;
  readonly description: string;
  readonly pack?: string;
  /** Display name used as key in skills-manifest.json agents (may differ from filesystem name) */
  readonly manifestName?: string;
}

export interface PackOption {
  readonly name: string;
  readonly dir: string;
  readonly manifest: PackManifest;
}

export interface WizardResult {
  readonly selections: ReadonlyArray<{
    readonly packDir: string;
    readonly manifest: PackManifest;
    readonly items: readonly InstallItem[];
  }>;
  readonly enableAutoActivation: boolean;
}

export interface InstallResult {
  readonly item: InstallItem;
  readonly destinationPath: string;
  readonly overwritten: boolean;
}

export interface InstallSummary {
  readonly packs: ReadonlyArray<{ readonly name: string; readonly version: string }>;
  readonly results: readonly InstallResult[];
}

export interface RemoveResult {
  readonly item: InstallItem;
  readonly removed: boolean;
}

export interface RemoveSummary {
  readonly results: readonly RemoveResult[];
}

export interface RemoveWizardResult {
  readonly items: readonly InstallItem[];
}
