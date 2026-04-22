export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue | undefined;
}

export type CliArgValue = string | boolean | undefined;
export type MeterMode = "depth" | "gr" | "peak" | string;
export type NativeTargetName = "auv2" | "clap" | "standalone" | "vst3" | string;
export type ProjectPluginKind = "effect" | "instrument" | string;
export type SuiteRuntimeListFormat = "json" | "keys" | "name" | "summary" | "tsv";
export type Vst3TuidPart = string | number;

export interface CliArgs {
  app?: CliArgValue;
  format?: CliArgValue;
  out?: CliArgValue;
  project?: CliArgValue;
  suite?: CliArgValue;
  workspace?: CliArgValue;
  "build-out"?: CliArgValue;
  "dist-out"?: CliArgValue;
  [key: string]: CliArgValue;
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
  schemaVersion?: number;
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

export interface ProjectUiShellHero extends JsonObject {
  title?: string;
  description?: string;
  status?: string;
}

export interface ProjectUiSectionCopy extends JsonObject {
  title?: string;
  description?: string;
}

export interface ProjectUiShellConfig extends JsonObject {
  eyebrow?: string;
  hero?: ProjectUiShellHero;
  sections?: Record<string, ProjectUiSectionCopy>;
}

export interface DisplayConfig extends JsonObject {
  enumLabels?: string[];
  onLabel?: string;
  offLabel?: string;
  precision?: number;
  suffix?: string;
}

export interface ProjectUiDisplayManifest extends JsonObject {
  enumLabels?: Record<string, string[]>;
  controls?: Record<string, DisplayConfig>;
}

export interface PreviewSurfaceBadge extends JsonObject {
  label?: string;
  control?: string;
  tone?: string;
}

export interface PreviewSurfaceControlRef extends JsonObject {
  label?: string;
  control?: string;
  controls?: string[];
  meterId?: string;
  readouts?: string[];
  role?: string;
  tone?: string;
}

export interface PreviewSurfaceConfig extends JsonObject {
  title?: string;
  description?: string;
  selection?: string | null;
  gridLabels?: string[];
  focusBadges?: PreviewSurfaceBadge[];
  bands?: JsonObject[];
  columns?: JsonObject[];
  connections?: JsonObject[];
  curveControls?: PreviewSurfaceControlRef[];
  detailItems?: PreviewSurfaceControlRef[];
  globalItems?: PreviewSurfaceControlRef[];
  items?: PreviewSurfaceControlRef[];
  keys?: JsonObject[];
  lanes?: JsonObject[];
  links?: JsonObject[];
  meters?: JsonObject[];
  modules?: JsonObject[];
  monitor?: JsonObject;
  nodes?: JsonObject[];
  readouts?: string[];
  regions?: JsonObject[];
  routes?: JsonObject[];
  rows?: JsonObject[];
  sections?: JsonObject[];
  series?: PreviewSurfaceControlRef[];
  slots?: JsonObject[];
  sources?: PreviewSurfaceControlRef[];
  taps?: JsonObject[];
  timingItems?: PreviewSurfaceControlRef[];
  voiceControl?: string | null;
}

export interface ProjectUiPreviewManifest extends JsonObject {
  surfaces?: Record<string, PreviewSurfaceConfig>;
}

export interface ProjectUiCatalogManifest extends JsonObject {
  productId?: string;
  prototypeRole?: string;
}

export interface GeneratedMeter extends JsonObject {
  id: string;
  label: string;
  max: number;
  mode: MeterMode;
  unit?: string | null;
}

export interface ProjectUiManifest extends JsonObject {
  family?: string | null;
  familyVersion?: number;
  variant?: string | null;
  overrides?: JsonObject;
  statusText?: string;
  controlOrder?: string[];
  meters?: GeneratedMeter[];
  catalog?: ProjectUiCatalogManifest;
  group?: string | null;
  accentPaletteId?: string | null;
  analyzerPresetIds?: string[];
  analyzerPresets?: Record<string, JsonObject>;
  controlKindIds?: string[];
  layout?: JsonObject;
  layoutProfile?: string | null;
  meterPresetIds?: string[];
  meterPresets?: Record<string, JsonObject>;
  presentation?: JsonObject;
  surfacePresetIds?: string[];
  surfacePresets?: Record<string, PreviewSurfaceConfig>;
  surfaces?: JsonValue[];
  theme?: JsonObject;
  themeGroup?: string | null;
  visualLanguage?: JsonObject;
  shell?: ProjectUiShellConfig;
  display?: ProjectUiDisplayManifest;
  preview?: ProjectUiPreviewManifest;
}

export interface UiFamilyVariantConfig extends ProjectUiManifest {
  extends?: string | null;
}

export interface UiFamilyManifest extends JsonObject {
  $schemaVersion?: number;
  id?: string;
  displayName?: string;
  description?: string;
  catalog?: JsonObject;
  controlKinds?: Record<string, JsonObject>;
  defaults?: ProjectUiManifest;
  formatters?: JsonObject;
  interactionGrammar?: JsonObject;
  meterPresets?: Record<string, JsonObject>;
  positioning?: JsonObject;
  presentation?: JsonObject;
  sharedPrimitives?: JsonObject;
  shell?: ProjectUiShellConfig;
  surfacePresets?: Record<string, PreviewSurfaceConfig>;
  analyzerPresets?: Record<string, JsonObject>;
  ui?: ProjectUiManifest;
  variants?: Record<string, UiFamilyVariantConfig>;
  visualLanguage?: JsonObject;
}

export interface UiFamilyRuntime {
  family: string;
  manifestPath: string;
  manifest: UiFamilyManifest;
  defaults: ProjectUiManifest;
  variants: Record<string, UiFamilyVariantConfig>;
}

export interface ProjectFaustManifest extends JsonObject {
  source: string;
  className: string;
}

export interface ProjectPluginGuiManifest extends JsonObject {
  native: boolean;
  webPreview: boolean;
  resizable: boolean;
}

export interface ProjectPluginManifest extends JsonObject {
  kind: ProjectPluginKind;
  inputs: number;
  outputs: number;
  midiInput: boolean;
  latencySeconds: number;
  gui: ProjectPluginGuiManifest;
}

export interface ProjectTargetsManifest extends JsonObject {
  active: NativeTargetName[];
  native: NativeTargetName[];
}

export interface ProjectOversamplingManifest extends JsonObject {
  factor: number;
}

export interface ProjectAudioUnitManifest extends JsonObject {
  type: string;
  subtype: string;
  manufacturer: string;
  tags: string[];
}

export interface ProjectClapManifest extends JsonObject {
  id: string;
  description: string;
  features: string[];
}

export interface ProjectVst3Manifest extends JsonObject {
  categories: string[];
  componentTuid: Vst3TuidPart[];
  controllerTuid: Vst3TuidPart[];
}

export interface ProjectStandaloneManifest extends JsonObject {
  bundleId: string;
}

export interface BenchmarkInitialControl extends JsonObject {
  label?: string;
  value?: number;
}

export interface ProjectBenchmarkManifest extends JsonObject {
  blockSize: number;
  exportOnlyTargets?: string[];
  initialControls?: BenchmarkInitialControl[];
  nativeTargets?: string[];
  sampleRate: number;
  seconds: number;
}

export interface ProjectManifest extends JsonObject {
  name: string;
  version: string;
  owner: string;
  companyName: string;
  companyTag: string;
  productName: string;
  artifactStem: string;
  bundleId: string;
  description: string;
  license: string;
  faust: ProjectFaustManifest;
  plugin: ProjectPluginManifest;
  targets: ProjectTargetsManifest;
  oversampling: ProjectOversamplingManifest;
  benchmark: ProjectBenchmarkManifest;
  au: ProjectAudioUnitManifest;
  clap: ProjectClapManifest;
  vst3: ProjectVst3Manifest;
  standalone: ProjectStandaloneManifest;
  ui: ProjectUiManifest;
}

export interface ProjectUiRuntime {
  hasProjectUi: boolean;
  family: string | null;
  variant: string | null;
  manifestPath: string | null;
  manifest: UiFamilyManifest | null;
  defaults: ProjectUiManifest;
  variantConfig: UiFamilyVariantConfig;
  inlineOverrides: JsonObject;
  explicitOverrides: JsonObject;
  resolved: JsonValue | undefined;
}

export interface CatalogProduct extends JsonObject {
  id?: string;
  displayName?: string;
  referenceProduct?: string;
  variant?: string;
  category?: string;
  status?: string;
  implementationOrder?: number;
  tagline?: string;
  accentPaletteId?: string;
  featureAnchors?: string[];
}

export interface CatalogManifest extends JsonObject {
  $schemaVersion?: number;
  id?: string;
  displayName?: string;
  family?: string;
  description?: string;
  namingTone?: string[];
  products?: CatalogProduct[];
  visualPolicy?: JsonObject;
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
  label: string;
  address: string;
}

export interface FaustUiExport extends JsonObject {
  size?: number;
  ui?: FaustUiItem[];
}

export interface GeneratedControl extends JsonObject {
  id: string;
  label: string;
  shortname?: string;
  address: string;
  type?: string;
  init?: number;
  min?: number;
  max?: number;
  step?: number;
  unit?: string | null;
  scale?: string | null;
  isToggle?: boolean;
  enumLabels?: string[];
  display?: DisplayConfig;
}

export interface GeneratedSchemaProject extends JsonObject {
  key: string;
  name: string;
  description?: string;
  statusText?: string;
  kind: ProjectPluginKind;
  inputs?: number;
  outputs?: number;
  previewOnly?: boolean;
  uiFamily?: string | null;
  uiVariant?: string | null;
}

export interface GeneratedUiSchema extends JsonObject {
  project: GeneratedSchemaProject;
  ui: ProjectUiManifest;
  controls: GeneratedControl[];
  meters: GeneratedMeter[];
  benchmarkPath?: string;
}

export interface BenchmarkResult extends JsonObject {
  target: string;
  elapsedSeconds?: number;
  nsPerFrame: number;
  processedFrames: number;
  realtimeFactor: number;
}

export interface BenchmarkReportHost extends JsonObject {
  platform?: string;
  arch?: string;
  cpus?: string;
}

export interface BenchmarkReport extends JsonObject {
  host?: BenchmarkReportHost;
  benchmark?: JsonObject;
  results?: BenchmarkResult[];
}

export interface GeneratedWorkspaceApp extends JsonObject {
  key: string;
  name: string;
  description: string;
  manifest: string;
  schemaPath: string;
  benchmarkPath: string;
  previewPath: string;
}

export interface GeneratedWorkspaceManifest extends JsonObject {
  name?: string;
  version?: string;
  defaultApp?: string;
  apps: GeneratedWorkspaceApp[];
}

export interface PreviewRoots {
  eyebrow: HTMLElement;
  title: HTMLElement;
  description: HTMLElement;
  status: HTMLElement;
  nav: HTMLElement;
  surfacePanel: HTMLElement;
  surfacesTitle: HTMLElement;
  surfacesDescription: HTMLElement;
  surfaces: HTMLElement;
  controlsTitle: HTMLElement;
  controlsDescription: HTMLElement;
  controls: HTMLElement;
  metersTitle: HTMLElement;
  metersDescription: HTMLElement;
  meters: HTMLElement;
  benchmarksTitle: HTMLElement;
  benchmarksDescription: HTMLElement;
  benchmarks: HTMLElement;
}

export interface PreviewMeterView {
  fill: HTMLElement;
  value: HTMLElement;
  meter: GeneratedMeter;
}

export interface PreviewSimulator {
  id: string;
  measure: (state: PreviewState, meterId: string, meter: GeneratedMeter) => number;
}

export interface PreviewState {
  controls: Map<string, unknown>;
  meterViews: Map<string, PreviewMeterView>;
  surfaceViews: Array<() => void>;
  motionPhase: number;
  animationFrame: number;
  schema: GeneratedUiSchema | null;
  simulator: PreviewSimulator | null;
  workspace: GeneratedWorkspaceManifest | null;
  refreshSurfaceViews?: () => void;
}

export interface GeneratedProjectFixture {
  runtime: ProjectRuntime;
  schema: GeneratedUiSchema;
  faustUi: FaustUiExport;
  faustControls: FaustControlItem[];
}

export interface RuntimeEnvironmentExports {
  FWAK_APP_KEY: string;
  FWAK_APP_NAME: string;
  FWAK_APP_MANIFEST: string;
  FWAK_ARTIFACT_STEM: string;
  FWAK_PROJECT_VERSION: string;
  FWAK_PACKAGE_ID: string;
  FWAK_GENERATED_DIR: string;
  FWAK_TARGET_DIR: string;
  FWAK_BUILD_DIR: string;
  FWAK_DIST_DIR: string;
  FWAK_AU_TYPE: string;
  FWAK_AU_SUBTYPE: string;
  FWAK_AU_MANUFACTURER: string;
  [key: string]: string;
}

export interface SuiteRuntimeListApp {
  key: string;
  name: string;
  artifactStem: string;
  buildDir: string;
  distDir: string;
  generatedDir: string;
  version: string;
  bundleId: string;
  category: string | null;
  variant: string | null;
  implementationOrder?: number;
}

export interface SuiteRuntimeListPayload {
  id: string;
  name: string;
  catalogFile: string;
  workspaceVersion?: string;
  apps: SuiteRuntimeListApp[];
}
