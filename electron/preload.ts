import { contextBridge, ipcRenderer, webFrame } from "electron";
import type { MythicApi, ScanMatch, ScanProgress } from "./shared/types";

let audioCtx: AudioContext | null = null;
let soundEnabled = true;

function beep(): void {
  if (!soundEnabled) return;
  try {
    audioCtx = audioCtx || new AudioContext();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.35);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.4);
  } catch {
    /* audio unavailable */
  }
}

const api: MythicApi = {
  platform: process.platform,
  version: "1.4.0",
  windowMinimize: () => ipcRenderer.send("win:minimize"),
  windowToggleMaximize: () => ipcRenderer.send("win:toggle-maximize"),
  windowClose: () => ipcRenderer.send("win:close"),
  zoomIn: () => {
    const z = Math.min(1.5, webFrame.getZoomFactor() + 0.1);
    webFrame.setZoomFactor(z);
  },
  zoomOut: () => {
    const z = Math.max(0.6, webFrame.getZoomFactor() - 0.1);
    webFrame.setZoomFactor(z);
  },
  reload: () => ipcRenderer.send("win:reload"),
  notifySound: (enabled) => {
    if (typeof enabled === "boolean") soundEnabled = enabled;
    else beep();
  },
  selectFolders: () => ipcRenderer.invoke("select-folders"),
  openInExplorer: (p) => ipcRenderer.send("open-in-explorer", p),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
  openPath: (p) => ipcRenderer.invoke("open-path", p),
  listDrives: () => ipcRenderer.invoke("list-drives"),
  startScan: (folders) => ipcRenderer.invoke("start-scan", folders),
  stopScan: () => ipcRenderer.invoke("stop-scan"),
  getSteamAccounts: (roots) => ipcRenderer.invoke("steam-accounts", roots),
  getRecentFiles: () => ipcRenderer.invoke("recent-files"),
  getUsbDevices: () => ipcRenderer.invoke("usb-devices"),
  getLastActivity: () => ipcRenderer.invoke("last-activity"),
  getSoftware: () => ipcRenderer.invoke("software"),
  getRegistry: () => ipcRenderer.invoke("registry"),
  getProcesses: () => ipcRenderer.invoke("processes"),
  getRenamedFiles: () => ipcRenderer.invoke("renamed"),
  getSites: () => ipcRenderer.invoke("sites"),
  getOtherChecks: () => ipcRenderer.invoke("other"),
  getTraces: () => ipcRenderer.invoke("traces"),
  getUtilities: () => ipcRenderer.invoke("utilities"),
  runUtility: (id: string) => ipcRenderer.invoke("run-utility", id),
  getSystemInfo: () => ipcRenderer.invoke("system-info"),
  exportAccounts: () => ipcRenderer.invoke("export-accounts"),
  buildReport: () => ipcRenderer.invoke("build-report"),
  exportReport: () => ipcRenderer.invoke("export-report"),
  copyReport: () => ipcRenderer.invoke("copy-report"),
  onScanProgress: (cb) => {
    const h = (_e: unknown, p: ScanProgress) => cb(p);
    ipcRenderer.on("scan:progress", h);
    return () => ipcRenderer.removeListener("scan:progress", h);
  },
  onScanResult: (cb) => {
    const h = (_e: unknown, m: ScanMatch) => {
      beep();
      cb(m);
    };
    ipcRenderer.on("scan:result", h);
    return () => ipcRenderer.removeListener("scan:result", h);
  },
  onScanDone: (cb) => {
    const h = (_e: unknown, r: { matches: ScanMatch[]; scanned: number; durationMs: number }) => cb(r);
    ipcRenderer.on("scan:done", h);
    return () => ipcRenderer.removeListener("scan:done", h);
  },
};

contextBridge.exposeInMainWorld("mythic", api);
