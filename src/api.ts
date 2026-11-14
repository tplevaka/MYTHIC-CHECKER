import type { MythicApi, ScanMatch, ScanProgress } from "@shared/types";

const noop = () => {};
const emptyResult = () => Promise.resolve({ items: [] as never[], generatedAt: "", durationMs: 0 });

/** Browser stub so the renderer can also be developed in a plain browser tab. */
const browserStub: MythicApi = {
  platform: "browser",
  version: "1.4.0",
  windowMinimize: noop,
  windowToggleMaximize: noop,
  windowClose: noop,
  zoomIn: noop,
  zoomOut: noop,
  reload: noop,
  notifySound: noop,
  selectFolders: () => Promise.resolve([]),
  openInExplorer: noop,
  openExternal: () => Promise.resolve({ ok: false }),
  openPath: () => Promise.resolve({ ok: false }),
  listDrives: () => Promise.resolve([]),
  startScan: () => Promise.resolve(),
  stopScan: () => Promise.resolve(),
  getSteamAccounts: emptyResult,
  getRecentFiles: emptyResult,
  getUsbDevices: emptyResult,
  getLastActivity: emptyResult,
  getSoftware: emptyResult,
  getRegistry: emptyResult,
  getProcesses: emptyResult,
  getRenamedFiles: emptyResult,
  getSites: emptyResult,
  getOtherChecks: emptyResult,
  getTraces: emptyResult,
  getUtilities: emptyResult,
  runUtility: async () => ({ ok: false, action: "failed" as const }),
  getSystemInfo: () =>
    Promise.resolve({
      os: "—", kernel: "—", cpu: "—", cores: 0, gpu: "—", ramGb: 0,
      monitors: 0, uptimeHours: 0, bootTime: "", installDate: "", board: "—", vm: false,
      hostname: "—", localIps: [], macroFlags: [],
    }),
  exportAccounts: () => Promise.resolve({ ok: false }),
  buildReport: () => Promise.resolve({
    app: "MYTHIC CHECKER", version: "1.4.0", platform: "browser", generatedAt: new Date().toISOString(),
    fileSearch: [], usb: [], activity: [], software: [], registry: [], steam: [], processes: [], renamed: [], sites: [], other: [], traces: [], utilities: [],
  }),
  exportReport: () => Promise.resolve({ ok: false }),
  copyReport: () => Promise.resolve({ ok: false }),
  onScanProgress: (_cb: (p: ScanProgress) => void) => noop,
  onScanResult: (_cb: (m: ScanMatch) => void) => noop,
  onScanDone: (_cb: (r: { matches: ScanMatch[]; scanned: number; durationMs: number }) => void) => noop,
};

export function api(): MythicApi {
  return window.mythic ?? browserStub;
}
