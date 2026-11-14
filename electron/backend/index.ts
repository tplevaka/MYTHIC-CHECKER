import { app, BrowserWindow, clipboard, dialog, ipcMain, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import type { ReportData } from "../shared/types";
import { collectActivity, collectRecentFiles } from "./activity";
import { collectOther, collectTraces } from "./other";
import { collectProcesses } from "./processes";
import { collectRegistry } from "./registry";
import { collectRenamed } from "./renamed";
import { runScan, stopScan } from "./scanner";
import { collectSites } from "./sites";
import { collectSoftware } from "./software";
import { collectSteamAccounts } from "./steam";
import { getSystemInfo, getUtilities, listDrives, runUtility } from "./system";
import { collectUsbDevices } from "./usb";

function send(win: BrowserWindow, channel: string, payload: unknown): void {
  if (!win.isDestroyed()) win.webContents.send(channel, payload);
}

const lastResults: Partial<ReportData> = {};

function buildReport(): ReportData {
  return {
    app: "MYTHIC CHECKER",
    version: app.getVersion(),
    platform: process.platform,
    generatedAt: new Date().toISOString(),
    fileSearch: lastResults.fileSearch ?? [],
    usb: lastResults.usb ?? [],
    activity: lastResults.activity ?? [],
    software: lastResults.software ?? [],
    registry: lastResults.registry ?? [],
    steam: lastResults.steam ?? [],
    processes: lastResults.processes ?? [],
    renamed: lastResults.renamed ?? [],
    sites: lastResults.sites ?? [],
    other: lastResults.other ?? [],
    traces: lastResults.traces ?? [],
    utilities: lastResults.utilities ?? [],
    systemInfo: lastResults.systemInfo,
  };
}

export function registerIpcHandlers(getWindow: () => BrowserWindow | null): void {
  ipcMain.handle("select-folders", async () => {
    const win = getWindow();
    if (!win) return [];
    const r = await dialog.showOpenDialog(win, {
      title: "MYTHIC CHECKER — Select folders",
      properties: ["openDirectory", "multiSelections"],
    });
    return r.filePaths;
  });

  ipcMain.on("open-in-explorer", (_e, p: string) => {
    shell.showItemInFolder(p);
  });

  ipcMain.handle("open-external", async (_e, url: string) => {
    try {
      const u = new URL(url);
      if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false };
      await shell.openExternal(u.toString());
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.handle("open-path", async (_e, p: string) => {
    const err = await shell.openPath(p);
    return err ? { ok: false, error: err } : { ok: true };
  });

  ipcMain.handle("list-drives", () => listDrives());

  ipcMain.handle("utilities", async () => {
    const r = await getUtilities();
    lastResults.utilities = r.items;
    return r;
  });

  ipcMain.handle("run-utility", (_e, id: string) =>
    runUtility(
      String(id),
      (url) => shell.openExternal(url),
      (p) => shell.openPath(p),
    ),
  );

  ipcMain.handle("system-info", async () => {
    const r = await getSystemInfo();
    lastResults.systemInfo = r;
    return r;
  });

  ipcMain.handle("export-accounts", async () => {
    const win = getWindow();
    if (!win) return { ok: false };
    const r = await dialog.showSaveDialog(win, {
      title: "Export Steam accounts",
      defaultPath: path.join(app.getPath("documents"), `MYTHIC-steam-accounts-${Date.now()}.json`),
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    fs.writeFileSync(r.filePath, JSON.stringify(lastResults.steam ?? [], null, 2), "utf-8");
    clipboard.writeText(JSON.stringify(lastResults.steam ?? [], null, 2));
    return { ok: true, filePath: r.filePath };
  });

  ipcMain.handle("start-scan", async (_e, folders: string[]) => {
    const win = getWindow();
    if (!win) return;
    try {
      const res = await runScan(
        folders,
        (p) => send(win, "scan:progress", p),
        (m) => send(win, "scan:result", m),
      );
      lastResults.fileSearch = res.matches;
      send(win, "scan:done", res);
    } catch (err) {
      send(win, "scan:progress", { status: "error", currentPath: String(err) });
    }
  });

  ipcMain.handle("stop-scan", () => stopScan());

  ipcMain.handle("recent-files", () => collectRecentFiles());

  ipcMain.handle("steam-accounts", async (_e, roots: unknown = []) => {
    if (!Array.isArray(roots) || roots.length > 32 || roots.some((r) => typeof r !== "string" || !path.isAbsolute(r))) throw new Error("Invalid Steam folders");
    const r = await collectSteamAccounts(roots);
    lastResults.steam = r.items;
    return r;
  });

  ipcMain.handle("usb-devices", async () => {
    const r = await collectUsbDevices();
    lastResults.usb = r.items;
    return r;
  });

  ipcMain.handle("last-activity", async () => {
    const r = await collectActivity();
    lastResults.activity = r.items;
    return r;
  });

  ipcMain.handle("software", async () => {
    const r = await collectSoftware();
    lastResults.software = r.items;
    return r;
  });

  ipcMain.handle("registry", async () => {
    const r = await collectRegistry();
    lastResults.registry = r.items;
    return r;
  });

  ipcMain.handle("processes", async () => {
    const r = await collectProcesses();
    lastResults.processes = r.items;
    return r;
  });

  ipcMain.handle("renamed", async () => {
    const r = await collectRenamed();
    lastResults.renamed = r.items;
    return r;
  });

  ipcMain.handle("sites", async () => {
    const r = await collectSites();
    lastResults.sites = r.items;
    return r;
  });

  ipcMain.handle("other", async () => {
    const r = await collectOther();
    lastResults.other = r.items;
    return r;
  });

  ipcMain.handle("traces", async () => {
    const r = await collectTraces();
    lastResults.traces = r.items;
    return r;
  });

  ipcMain.handle("build-report", () => buildReport());

  ipcMain.handle("export-report", async () => {
    const win = getWindow();
    if (!win) return { ok: false };
    const r = await dialog.showSaveDialog(win, {
      title: "Export MYTHIC report",
      defaultPath: path.join(app.getPath("documents"), `MYTHIC-report-${Date.now()}.json`),
      filters: [{ name: "JSON report", extensions: ["json"] }],
    });
    if (r.canceled || !r.filePath) return { ok: false };
    fs.writeFileSync(r.filePath, JSON.stringify(buildReport(), null, 2), "utf-8");
    return { ok: true, filePath: r.filePath };
  });

  ipcMain.handle("copy-report", async () => {
    clipboard.writeText(JSON.stringify(buildReport(), null, 2));
    return { ok: true };
  });
}
