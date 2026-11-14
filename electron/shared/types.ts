export type RiskLevel = "high" | "medium" | "low";

export interface ScanMatch {
  id: string;
  name: string;
  cheat: string;
  type: string;
  size: number;
  modified: string;
  path: string;
  risk: RiskLevel;
  signature: string;
}

export interface ScanProgress {
  status: "idle" | "running" | "done" | "error";
  currentPath: string;
  scannedFiles: number;
  found: number;
  startedAt: number | null;
}

export interface SteamAccount {
  id: string;
  steamId64: string;
  accountName: string;
  personaName: string;
  mostRecent: boolean;
  vacStatus: "clean" | "banned" | "unknown";
  avatarUrl?: string;
  level?: number;
  lastSessionIp?: string;
  vacBans?: number;
  gameBans?: number;
  daysSinceLastBan?: number;
  lastBanDateApprox?: string;
  cs2BanStatus?: "clean" | "banned" | "unknown";
  cs2BanDates?: string[];
  banSource?: string;
  banCheckedAt?: string;
  communityUrl?: string;
  realName?: string;
  privacy?: "public" | "friends" | "private";
  memberSince?: string;
  lastLogin?: string;
  source?: string;
}

export interface UsbDevice {
  id: string;
  name: string;
  deviceId: string;
  firstSeen?: string;
  lastSeen?: string;
  source: string;
}

export interface ActivityEntry {
  id: string;
  name: string;
  category: string;
  time: string;
  path: string;
  risk: RiskLevel;
}

export interface SoftwareEntry {
  id: string;
  name: string;
  version: string;
  installDate: string;
  source: string;
  risk: RiskLevel;
  note: string;
}

export interface RegistryEntry {
  id: string;
  key: string;
  value: string;
  source: string;
  risk: RiskLevel;
  note: string;
}

export interface ProcessEntry {
  id: string;
  name: string;
  pid: number;
  path: string;
  injectedModules: string[];
  note?: string;
  risk: RiskLevel;
}

export interface RenamedEntry {
  id: string;
  name: string;
  realType: string;
  declaredExt: string;
  path: string;
  size: number;
  risk: RiskLevel;
  source?: string;
  originalName?: string;
}

export interface DriveInfo {
  root: string;
  label: string;
  system: boolean;
  freeGb?: number;
  totalGb?: number;
}

export interface UtilityEntry {
  id: string;
  group: "files" | "browser" | "game" | "registry";
  name: string;
  description: string;
  installed: boolean;
  builtin: boolean;
  path: string;
  downloadUrl: string;
}

export interface SystemInfo {
  os: string;
  kernel: string;
  cpu: string;
  cores: number;
  gpu: string;
  ramGb: number;
  monitors: number;
  uptimeHours: number;
  bootTime: string;
  installDate: string;
  board: string;
  vm: boolean;
  hostname: string;
  localIps: string[];
  macroFlags: string[];
}

export interface SiteEntry {
  id: string;
  domain: string;
  category: string;
  browser: string;
  profile: string;
  risk: RiskLevel;
}

export interface OtherCheck {
  id: string;
  name: string;
  status: "ok" | "warn" | "fail" | "info";
  detail: string;
  evidence?: string[];
}

export interface TabResult<T> {
  generatedAt: string;
  durationMs: number;
  items: T[];
  error?: string;
}

export interface ReportData {
  app: string;
  version: string;
  platform: string;
  generatedAt: string;
  fileSearch: ScanMatch[];
  usb: UsbDevice[];
  activity: ActivityEntry[];
  software: SoftwareEntry[];
  registry: RegistryEntry[];
  steam: SteamAccount[];
  processes: ProcessEntry[];
  renamed: RenamedEntry[];
  sites: SiteEntry[];
  other: OtherCheck[];
  traces: OtherCheck[];
  utilities: UtilityEntry[];
  systemInfo?: SystemInfo;
}

export type TabId =
  | "file-search"
  | "usb-devices"
  | "last-activity"
  | "software"
  | "pc-registry"
  | "steam-accounts"
  | "traces"
  | "processes"
  | "renamed-files"
  | "sites"
  | "other";

export interface MythicApi {
  platform: string;
  version: string;
  windowMinimize(): void;
  windowToggleMaximize(): void;
  windowClose(): void;
  zoomIn(): void;
  zoomOut(): void;
  reload(): void;
  notifySound(enabled?: boolean): void;
  selectFolders(): Promise<string[]>;
  openInExplorer(path: string): void;
  openExternal(url: string): Promise<{ ok: boolean }>;
  openPath(path: string): Promise<{ ok: boolean; error?: string }>;
  listDrives(): Promise<DriveInfo[]>;
  startScan(folders: string[]): Promise<void>;
  stopScan(): Promise<void>;
  getSteamAccounts(roots?: string[]): Promise<TabResult<SteamAccount>>;
  getRecentFiles(): Promise<TabResult<ActivityEntry>>;
  getUsbDevices(): Promise<TabResult<UsbDevice>>;
  getLastActivity(): Promise<TabResult<ActivityEntry>>;
  getSoftware(): Promise<TabResult<SoftwareEntry>>;
  getRegistry(): Promise<TabResult<RegistryEntry>>;
  getProcesses(): Promise<TabResult<ProcessEntry>>;
  getRenamedFiles(): Promise<TabResult<RenamedEntry>>;
  getSites(): Promise<TabResult<SiteEntry>>;
  getOtherChecks(): Promise<TabResult<OtherCheck>>;
  getTraces(): Promise<TabResult<OtherCheck>>;
  getUtilities(): Promise<TabResult<UtilityEntry>>;
  runUtility(id: string): Promise<{ ok: boolean; action: "launched" | "builtin" | "internal" | "download" | "failed" }>;
  getSystemInfo(): Promise<SystemInfo>;
  exportAccounts(): Promise<{ ok: boolean; filePath?: string }>;
  buildReport(): Promise<ReportData>;
  exportReport(): Promise<{ ok: boolean; filePath?: string }>;
  copyReport(): Promise<{ ok: boolean }>;
  onScanProgress(cb: (p: ScanProgress) => void): () => void;
  onScanResult(cb: (m: ScanMatch) => void): () => void;
  onScanDone(cb: (r: { matches: ScanMatch[]; scanned: number; durationMs: number }) => void): () => void;
}
