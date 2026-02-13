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
}

export interface SelectionResult {
  readonly items: readonly InstallItem[];
  readonly enableAutoActivation: boolean;
}

export interface InstallResult {
  readonly item: InstallItem;
  readonly destinationPath: string;
  readonly overwritten: boolean;
}

export interface InstallSummary {
  readonly packName: string;
  readonly packVersion: string;
  readonly results: readonly InstallResult[];
}

export interface RemoveResult {
  readonly item: InstallItem;
  readonly removed: boolean;
}

export interface RemoveSummary {
  readonly results: readonly RemoveResult[];
}
