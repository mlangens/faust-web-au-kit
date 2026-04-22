export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export interface CliArgs {
  [key: string]: string | boolean | undefined;
}

export interface WorkspaceAppManifest extends JsonObject {
  key?: string;
  name?: string;
  manifest?: string;
}

export interface WorkspacePaths extends JsonObject {
  apps?: string;
  generatedRoot?: string;
  generatedApps?: string;
  buildApps?: string;
  distApps?: string;
}

export interface WorkspaceManifest extends JsonObject {
  name?: string;
  version?: string;
  defaultApp?: string;
  paths?: WorkspacePaths;
  apps?: WorkspaceAppManifest[];
}

export interface WorkspacePathConfig {
  appsDir: string;
  generatedRootDir: string;
  generatedAppsDir: string;
  buildAppsDir: string;
  distAppsDir: string;
}

export interface ResolvedAppEntry {
  key: string;
  name: string;
  manifest: string;
  manifestPath: string;
  generatedDir: string;
  buildDir: string;
  distDir: string;
  previewPath: string;
}

export interface WorkspaceRuntime extends WorkspacePathConfig {
  args: CliArgs;
  root: string;
  workspaceFile: string;
  workspace: WorkspaceManifest;
  defaultAppKey: string;
  appEntries: ResolvedAppEntry[];
}

export interface UiFamilyManifest extends JsonObject {
  defaults?: JsonObject;
  variants?: Record<string, JsonObject>;
  ui?: JsonObject;
}

export interface UiFamilyRuntime {
  family: string;
  manifestPath: string;
  manifest: UiFamilyManifest;
  defaults: JsonObject;
  variants: JsonObject;
}

export interface ProjectUiManifest extends JsonObject {
  family?: string;
  variant?: string;
  overrides?: JsonObject;
  statusText?: string;
  controlOrder?: string[];
  meters?: GeneratedMeter[];
  shell?: {
    hero?: {
      status?: string;
    };
    sections?: Record<
      string,
      {
        title?: string;
        description?: string;
      }
    >;
  };
  display?: {
    enumLabels?: Record<string, string[]>;
    [key: string]: JsonValue | undefined;
  };
  preview?: {
    surfaces?: Record<string, PreviewSurfaceConfig>;
    [key: string]: JsonValue | undefined;
  };
}

export interface ProjectManifest extends JsonObject {
  name: string;
  productName?: string;
  description?: string;
  faust: {
    source: string;
    className?: string;
  };
  plugin?: {
    kind?: string;
    inputs?: number;
    outputs?: number;
  };
  ui?: ProjectUiManifest;
}

export interface ProjectUiRuntime {
  hasProjectUi: boolean;
  family: string | null;
  variant: string | null;
  manifestPath: string | null;
  manifest: UiFamilyManifest | null;
  defaults: JsonObject;
  variantConfig: JsonObject;
  inlineOverrides: JsonObject;
  explicitOverrides: JsonObject;
  resolved: JsonValue | undefined;
}

export interface ProjectRuntime {
  args: CliArgs;
  root: string;
  workspaceFile: string;
  workspace: WorkspaceManifest;
  workspaceRuntime: WorkspaceRuntime;
  appKey: string;
  appEntry: ResolvedAppEntry;
  appDir: string;
  projectFile: string;
  project: ProjectManifest;
  rawProject: ProjectManifest;
  projectManifest: ProjectManifest;
  uiRuntime: ProjectUiRuntime;
  ui: JsonValue | undefined;
  sourceFile: string;
  sourceBase: string;
  outputDir: string;
  targetDir: string;
  buildDir: string;
  distDir: string;
  generatedRootDir: string;
  generatedAppsDir: string;
  buildRootDir: string;
  distRootDir: string;
  previewPath: string;
  isDefaultApp: boolean;
  suiteProduct?: CatalogProduct;
  implementationOrder?: number;
}

export interface CatalogProduct extends JsonObject {
  id?: string;
  implementationOrder?: number;
}

export interface CatalogManifest extends JsonObject {
  id?: string;
  displayName?: string;
  products?: CatalogProduct[];
}

export interface ResolvedSuiteEntry {
  order: number;
  index: number;
  product: CatalogProduct;
  appEntry: ResolvedAppEntry;
}

export interface ResolvedSuite {
  id: string;
  catalogFile: string;
  catalog: CatalogManifest;
  entries: ResolvedSuiteEntry[];
}

export interface SuiteRuntime {
  args: CliArgs;
  root: string;
  workspaceFile: string;
  workspace: WorkspaceManifest;
  workspaceRuntime: WorkspaceRuntime;
  suiteId: string;
  suiteFile: string;
  suiteCatalog: CatalogManifest;
  suiteName: string;
  appEntries: ResolvedAppEntry[];
  apps: ProjectRuntime[];
}

export interface FaustMetaEntry {
  [key: string]: string | undefined;
}

export interface FaustUiItem extends JsonObject {
  type?: string;
  label?: string;
  address?: string;
  shortname?: string;
  unit?: string;
  scale?: string;
  min?: number;
  max?: number;
  step?: number;
  init?: number;
  meta?: FaustMetaEntry[];
  items?: FaustUiItem[];
}

export interface FaustControlItem extends FaustUiItem {
  type: string;
}

export interface DisplayConfig extends JsonObject {
  enumLabels?: string[];
  onLabel?: string;
  offLabel?: string;
  precision?: number;
  suffix?: string;
}

export interface GeneratedControl extends JsonObject {
  id: string;
  label: string;
  address: string;
  init?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string | null;
  scale?: string | null;
  isToggle?: boolean;
}

export interface GeneratedMeter extends JsonObject {
  id: string;
  label: string;
  max: number;
  mode: string;
  unit?: string;
}

export interface PreviewSurfaceConfig extends JsonObject {
  title?: string;
  description?: string;
}

export interface GeneratedUiSchema extends JsonObject {
  project: {
    key: string;
    name: string;
    kind: string;
  };
  ui: ProjectUiManifest & {
    surfacePresetIds?: string[];
  };
  controls: GeneratedControl[];
  meters: GeneratedMeter[];
  benchmarkPath?: string;
}
