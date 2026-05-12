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

export interface ProjectUiSimulatorManifest extends JsonObject {
  id?: string;
  kind?: string;
  name?: string;
  type?: string;
  family?: string;
}

export interface DisplayConfig extends JsonObject {
  enumLabels?: string[];
  onLabel?: string;
  offLabel?: string;
  precision?: number;
  suffix?: string;
  widget?: string;
  tone?: string;
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

export interface PreviewPrimitivePaletteItem extends JsonObject {
  id?: string;
  label?: string;
  role?: string;
  slotType?: number;
  amount?: number;
  tone?: number | string;
  mix?: number;
  toneId?: string;
  description?: string;
}

export interface PreviewPrimitiveRecipeSlot extends JsonObject {
  slot?: number;
  primitiveId?: string;
  slotType?: number;
  amount?: number;
  tone?: number;
  mix?: number;
}

export interface PreviewPrimitiveRecipe extends JsonObject {
  id?: string;
  label?: string;
  targetAppKey?: string;
  productName?: string;
  artifactStem?: string;
  bundleId?: string;
  auSubtype?: string;
  description?: string;
  installerCommand?: string;
  expectedPackagePath?: string;
  slots?: PreviewPrimitiveRecipeSlot[];
  macros?: Record<string, number>;
}

export interface PreviewSurfaceConfig extends JsonObject {
  title?: string;
  description?: string;
  workflow?: string;
  selection?: string | null;
  defaultRecipe?: string;
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
  primitivePalette?: PreviewPrimitivePaletteItem[];
  recipes?: PreviewPrimitiveRecipe[];
  sources?: PreviewSurfaceControlRef[];
  taps?: JsonObject[];
  timingItems?: PreviewSurfaceControlRef[];
  voiceControl?: string | null;
}

export interface PreviewControlLayoutItem extends JsonObject {
  control?: string;
  label?: string;
  widget?: string;
  accent?: string;
  span?: number;
  surfaceOnly?: boolean;
}

export interface PreviewControlSection extends JsonObject {
  id?: string;
  title?: string;
  description?: string;
  kind?: string;
  columns?: number;
  items?: PreviewControlLayoutItem[];
}

export interface PreviewControlLayout extends JsonObject {
  layout?: string;
  sections?: PreviewControlSection[];
  supplementalTitle?: string;
  supplementalDescription?: string;
}

export interface ProjectUiPreviewManifest extends JsonObject {
  controls?: PreviewControlLayout;
  surfaces?: Record<string, PreviewSurfaceConfig>;
  simulator?: ProjectUiSimulatorManifest | string | null;
}

export interface ProjectUiCatalogManifest extends JsonObject {
  productId?: string;
  prototypeRole?: string;
  referenceProduct?: string;
  featureAnchors?: string[];
  primitiveIds?: string[];
}

export interface DspPrimitiveResearchSource extends JsonObject {
  id?: string;
  title?: string;
  url?: string;
  subjects?: string[];
}

export interface DspPrimitiveControlRole extends JsonObject {
  role?: string;
  unit?: string;
  scale?: string;
  surface?: string;
}

export interface DspPrimitiveMeasurementProfile extends JsonObject {
  probe?: string;
  target?: string;
  probeSignalIds?: string[];
  metrics?: string[];
}

export type PrimitiveMaturityStage =
  | "observed"
  | "modeled"
  | "implemented"
  | "surface-bound"
  | "sonically-verified"
  | "native-ready"
  | string;

export interface DspPrimitiveMaturity extends JsonObject {
  stage?: PrimitiveMaturityStage;
  implementation?: string;
  sonicVerification?: string;
  evidence?: string[];
}

export interface DspPrimitive extends JsonObject {
  family?: string;
  title?: string;
  description?: string;
  dspIntent?: string;
  faustLibraries?: string[];
  maturity?: DspPrimitiveMaturity;
  controlRoles?: DspPrimitiveControlRole[];
  surfaceRoles?: string[];
  analysisProbes?: string[];
  probeProfileIds?: string[];
  measurementProfiles?: DspPrimitiveMeasurementProfile[];
  uiExtractionSignals?: string[];
  agentDesignNotes?: string[];
}

export interface DspPrimitiveLibrary extends JsonObject {
  $schemaVersion?: number;
  id?: string;
  displayName?: string;
  description?: string;
  maturityModel?: JsonObject;
  researchSources?: DspPrimitiveResearchSource[];
  families?: Record<string, JsonObject>;
  primitives?: Record<string, DspPrimitive>;
  variantPrimitiveMap?: Record<string, string[]>;
  categoryPrimitiveMap?: Record<string, string[]>;
  productPrimitiveMap?: Record<string, string[]>;
}

export interface ProbeSignalDefinition extends JsonObject {
  generator?: string;
  durationSeconds?: number;
  amplitude?: number;
  levelDb?: number;
  frequencyHz?: number;
  startFrequencyHz?: number;
  endFrequencyHz?: number;
  activeChannel?: string;
  burstMilliseconds?: number;
  gapMilliseconds?: number;
  spacingMilliseconds?: number;
  frequenciesHz?: number[];
  levelsDb?: number[];
  description?: string;
  analysisTargets?: string[];
  tags?: string[];
}

export interface ProbeSignalProfile extends JsonObject {
  description?: string;
  signalIds?: string[];
}

export interface ProbeSignalCorpus extends JsonObject {
  $schemaVersion?: number;
  id?: string;
  displayName?: string;
  description?: string;
  defaults?: JsonObject;
  signals?: Record<string, ProbeSignalDefinition>;
  profiles?: Record<string, ProbeSignalProfile>;
  primitiveProbeMap?: Record<string, string[]>;
}

export interface ProbeSignalManifestEntry extends JsonObject {
  id: string;
  generator?: string;
  path: string;
  sampleRate: number;
  channels: number;
  frames: number;
  durationSeconds: number;
  tags?: string[];
  analysisTargets?: string[];
  description?: string;
}

export interface ProbeSignalManifest extends JsonObject {
  id?: string;
  corpusId?: string;
  corpusPath?: string;
  generatedAt?: string;
  outputDir?: string;
  defaults?: JsonObject;
  primitiveIds?: string[];
  profileIds?: string[];
  signals?: ProbeSignalManifestEntry[];
}

export interface AudioAnalysisReport extends JsonObject {
  signalId?: string;
  generator?: string;
  sampleRate?: number;
  channels?: number;
  frames?: number;
  durationSeconds?: number;
  channelsAnalysis?: JsonObject[];
  mono?: JsonObject;
  stereoCorrelation?: number | null;
  spectralFingerprint?: Record<string, number>;
  harmonicFingerprint?: Record<string, number>;
  impulseLandmarks?: JsonObject | null;
  zeroCrossingFrequency?: JsonObject | null;
}

export interface UadPluginInventoryEntry extends JsonObject {
  id: string;
  format: string;
  displayName: string;
  normalizedName: string;
  productKey?: string;
  runtimeKind?: "uadx-native" | "uad-dsp" | "unknown" | string;
  nativeRuntime?: boolean;
  path: string;
  primitiveIds?: string[];
}

export interface UadPluginProfilePlanEntry extends UadPluginInventoryEntry {
  matchedRules?: string[];
  signalIds?: string[];
  renderableByBuiltInAuHost?: boolean;
}

export interface UadPluginProfileReport extends JsonObject {
  id?: string;
  generatedAt?: string;
  host?: JsonObject;
  inventory?: JsonObject;
  primitiveIds?: string[];
  signalIds?: string[];
  probeManifestPath?: string;
  plan?: UadPluginProfilePlanEntry[];
  render?: JsonObject;
}

export interface FaustAssemblageProfileReport extends JsonObject {
  id?: string;
  generatedAt?: string;
  host?: JsonObject;
  appKey?: string;
  primitiveIds?: string[];
  controlOverrides?: Record<string, number>;
  probeManifestPath?: string;
  renderDir?: string;
  analyses?: Record<string, JsonValue>;
}

export interface EmulationUadState extends JsonObject {
  id: string;
  label?: string;
  parameterOverrides?: Record<string, number>;
}

export interface EmulationCandidateState extends JsonObject {
  id: string;
  label?: string;
  controlOverrides?: Record<string, number>;
}

export interface EmulationCandidateScore extends JsonObject {
  candidateStateId: string;
  averageScore: number;
  signalCount: number;
}

export interface EmulationPilotTarget extends JsonObject {
  id: string;
  displayName?: string;
  pluginFilters?: string[];
  candidateApp: string;
  primitiveIds?: string[];
  signalIds?: string[];
  uadStates?: EmulationUadState[];
  candidateStates?: EmulationCandidateState[];
}

export interface EmulationAssemblySpec extends JsonObject {
  id?: string;
  generatedAt?: string;
  reference?: JsonObject;
  candidate?: JsonObject;
  primitiveIds?: string[];
  candidateScores?: EmulationCandidateScore[];
  residuals?: JsonObject[];
  notes?: string[];
}

export interface EmulationPilotReport extends JsonObject {
  id?: string;
  generatedAt?: string;
  host?: JsonObject;
  auHostPath?: string;
  outputDir?: string;
  renderMethod?: string;
  targets?: JsonObject[];
}

export interface ReferenceCorpusEntry extends JsonObject {
  id?: string;
  referenceType?: "sample-suite" | "outside-plugin" | string;
  vendor?: string;
  productName?: string;
  role?: string;
  extractionStatus?: PrimitiveMaturityStage;
  manualUrl?: string | null;
  sourcePackId?: string | null;
  observedPrimitiveIds?: string[];
  featureSignals?: string[];
  extractionNotes?: string;
}

export interface ReferenceCorpusSourcePack extends JsonObject {
  id?: string;
  sourceType?: string;
  path?: string;
  sourceUrl?: string;
  articleCount?: number;
  pagination?: string;
  extractionStatus?: PrimitiveMaturityStage;
}

export interface ReferenceCorpus extends JsonObject {
  $schemaVersion?: number;
  id?: string;
  displayName?: string;
  description?: string;
  methodology?: JsonObject;
  sourcePacks?: ReferenceCorpusSourcePack[];
  entries?: ReferenceCorpusEntry[];
}

export interface ReferenceCorpusEvidence extends JsonObject {
  id: string;
  referenceType?: string;
  vendor?: string;
  productName?: string;
  role?: string;
  extractionStatus?: string;
  manualUrl?: string | null;
  sourcePackId?: string | null;
  featureSignals?: string[];
  extractionNotes?: string;
}

export interface ResolvedReferenceCorpusEvidence extends JsonObject {
  id: string;
  displayName?: string;
  sourcePath: string;
  methodology: JsonObject;
  sampleSuites: ReferenceCorpusEvidence[];
  referenceCount: number;
  evidenceByPrimitive: Record<string, ReferenceCorpusEvidence[]>;
}

export interface ResolvedPrimitiveSet extends JsonObject {
  library: {
    id: string;
    displayName?: string;
    description?: string;
    sourcePath: string;
    researchSources: DspPrimitiveResearchSource[];
  };
  families: Record<string, JsonObject>;
  primitiveIds: string[];
  primitives: Record<string, DspPrimitive>;
  referenceCorpus?: ResolvedReferenceCorpusEvidence;
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
  eyebrow?: string;
  title?: string;
  description?: string;
  hero?: ProjectUiShellHero;
  statusText?: string;
  controlOrder?: string[];
  controls?: Record<string, DisplayConfig | JsonObject>;
  controlDisplay?: Record<string, DisplayConfig | JsonObject>;
  controlDisplays?: Record<string, DisplayConfig | JsonObject>;
  meters?: GeneratedMeter[];
  catalog?: ProjectUiCatalogManifest;
  primitiveIds?: string[];
  primitiveArchitecture?: ResolvedPrimitiveSet;
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
  sections?: Record<string, ProjectUiSectionCopy>;
  surfacePresetIds?: string[];
  surfacePresets?: Record<string, PreviewSurfaceConfig>;
  surfaces?: JsonValue[];
  simulator?: ProjectUiSimulatorManifest | string | null;
  meterSimulator?: ProjectUiSimulatorManifest | string | null;
  simulation?: ProjectUiSimulatorManifest | string | null;
  theme?: JsonObject;
  themeGroup?: string | null;
  themeTokens?: JsonObject;
  tokens?: JsonObject;
  formatting?: JsonObject;
  enumDisplays?: Record<string, JsonValue>;
  enums?: Record<string, JsonValue>;
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

export type SonicFixtureKind =
  | "bass-loop"
  | "brown-noise"
  | "drum-loop"
  | "impulse"
  | "imd-two-tone"
  | "multitone"
  | "pink-noise"
  | "pulse-train"
  | "silence"
  | "sine"
  | "step"
  | "stepped-sine"
  | "stereo-ambience"
  | "sweep"
  | "tone-burst"
  | "two-tone"
  | "vocal-sibilance"
  | "white-noise"
  | string;

export interface SonicFixtureManifest extends JsonObject {
  kind: SonicFixtureKind;
  amplitude?: number;
  bpm?: number;
  channels?: number;
  endFrequency?: number;
  frequency?: number;
  sampleRate?: number;
  seconds?: number;
  seed?: number;
  startFrequency?: number;
}

export interface SonicRenderManifest extends JsonObject {
  id: string;
  description?: string;
  parameters?: Record<string, number>;
}

export interface SonicAssertionManifest extends JsonObject {
  render: string;
  metric: string;
  reference?: string;
  between?: [number, number];
  eq?: number;
  gte?: number;
  lte?: number;
  maxDelta?: number;
  minDelta?: number;
}

export interface SonicStageManifest extends JsonObject {
  id: string;
  title?: string;
  description?: string;
  blockSize?: number;
  fixture: SonicFixtureManifest | SonicFixtureKind;
  renders: SonicRenderManifest[];
  assertions: SonicAssertionManifest[];
  tags?: string[];
}

export interface SonicNativeHostArtifacts extends JsonObject {
  standalone: string;
  vst3: string;
  clap: string;
}

export interface SonicNativeHostRequest extends JsonObject {
  version: number;
  mode: string;
  appKey: string;
  productName: string;
  pluginKind: ProjectPluginKind;
  generatedDir: string;
  artifacts: SonicNativeHostArtifacts;
  stages: SonicStageManifest[];
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
  sonicStages?: SonicStageManifest[];
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
  primitiveIds?: string[];
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
  sonicReportPath?: string;
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

export interface SonicRenderReport extends JsonObject {
  id: string;
  parameters?: Record<string, number>;
  metrics: Record<string, number>;
}

export interface SonicAssertionReport extends JsonObject {
  passed: boolean;
  message: string;
  assertion: SonicAssertionManifest;
  actual: number | null;
  reference: number | null;
}

export interface SonicStageReport extends JsonObject {
  id: string;
  title?: string;
  description?: string;
  fixture?: SonicFixtureManifest;
  renders: SonicRenderReport[];
  assertions: SonicAssertionReport[];
  passed: boolean;
}

export interface SonicSuiteReport extends JsonObject {
  version: number;
  mode: string;
  profile: string;
  appKey: string;
  productName: string;
  generatedAt: string;
  host?: BenchmarkReportHost;
  passed: boolean;
  stages: SonicStageReport[];
}

export interface GeneratedWorkspaceApp extends JsonObject {
  key: string;
  name: string;
  description: string;
  manifest: string;
  schemaPath: string;
  benchmarkPath: string;
  sonicReportPath?: string;
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
