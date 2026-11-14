import fs from "node:fs";
import path from "node:path";
import type { ProcessEntry, TabResult } from "../shared/types";
import { isWin, runCmd, winDir, programFiles, programFilesX86 } from "./platform";
import { matchPath, matchProcess } from "./signatures";

const SYSTEM_DIRS = [winDir, programFiles, programFilesX86, "/usr/lib", "/usr/share", "/lib", "/snap"];

function outsideTrustedRoots(mod: string, gamePath: string): boolean {
  const normalize = (p: string) => isWin ? p.toLowerCase() : p;
  const m = normalize(mod);
  const roots = [...SYSTEM_DIRS, ...(gamePath ? [path.dirname(gamePath)] : [])];
  if (roots.some((d) => m.startsWith(normalize(d) + path.sep))) return false;
  return /\.(dll|so)(\.\d+)*$/i.test(m);
}

async function collectWindows(): Promise<ProcessEntry[]> {
  const json = await runCmd("powershell", ["-NoProfile", "-NonInteractive", "-Command", "@(Get-Process | Select-Object @{n='name';e={$_.ProcessName + '.exe'}}, @{n='pid';e={$_.Id}}, @{n='path';e={$_.Path}}) | ConvertTo-Json -Compress"], 20000);
  let rows: { name: string; pid: number; path?: string }[] = [];
  try { rows = JSON.parse(json); } catch {
    const list = await runCmd("tasklist", ["/fo", "csv", "/nh"]);
    for (const line of list.split(/\r?\n/)) {
      const cols = line.split('\",\"').map((c) => c.replace(/^"|"$/g, ""));
      if (cols.length >= 2 && /^\d+$/.test(cols[1])) rows.push({ name: cols[0], pid: Number(cols[1]) });
    }
  }
  if (!rows.length) throw new Error("Process list unavailable");
  const out: ProcessEntry[] = [];
  for (const r of rows) {
    const hit = matchProcess(r.name) || (r.path ? matchPath(r.path) : null);
    const item: ProcessEntry = { id: `p-${r.pid}`, name: r.name, pid: r.pid, path: r.path ?? "", injectedModules: [], risk: hit?.risk ?? "low", note: hit ? "Known filename signature; verify manually" : "" };
    if (/^cs2\.exe$/i.test(r.name)) {
      const raw = await runCmd("powershell", ["-NoProfile", "-NonInteractive", "-Command", `try { $m = (Get-Process -Id ${r.pid} -ErrorAction Stop).Modules; @{ ok=$true; modules=@($m | ForEach-Object { $_.FileName }) } | ConvertTo-Json -Compress } catch { @{ok=$false;modules=@()} | ConvertTo-Json -Compress }`], 30000);
      let modules: { ok?: boolean; modules?: string[] } = {};
      try { modules = JSON.parse(raw); } catch { /* Access may be denied. */ }
      if (!modules.ok) item.note = "Game modules unavailable: run with administrator access; process may have exited";
      else {
        item.injectedModules = (modules.modules ?? []).filter((m) => matchPath(m) || outsideTrustedRoots(m, item.path));
        item.risk = item.injectedModules.some((m) => matchPath(m)?.risk === "high") ? "high" : item.injectedModules.length ? "medium" : item.risk;
        item.note = item.injectedModules.length ? "Non-system modules require review; overlays and unsigned modules are not proof of injection" : "Loaded modules checked; no matching signature";
      }
    }
    out.push(item);
  }
  return out;
}

async function collectLinux(): Promise<ProcessEntry[]> {
  const out: ProcessEntry[] = [];
  const procs = await fs.promises.readdir("/proc");
  for (const pidStr of procs) {
    if (!/^\d+$/.test(pidStr)) continue;
    const base = path.join("/proc", pidStr);
    let comm: string;
    let cmdline: string;
    try {
      comm = (await fs.promises.readFile(path.join(base, "comm"), "utf-8")).trim();
      cmdline = (await fs.promises.readFile(path.join(base, "cmdline"), "utf-8")).replace(/\0/g, " ").trim();
    } catch { continue; }
    const exe = await fs.promises.readlink(path.join(base, "exe")).catch(() => "");
    const hit = matchProcess(comm) || (exe ? matchPath(exe) : null);
    const isGame = comm === "cs2" || /^cs2\.exe$/i.test(comm) || /(?:^|\/)cs2(?:\.exe)?$/.test(exe);
    const injected = new Set<string>();
    let note = hit ? "Known filename signature; verify manually" : "";
    if (isGame) {
      try {
        const environ = await fs.promises.readFile(path.join(base, "environ"), "utf-8");
        const preload = /(?:^|\0)LD_PRELOAD=([^\0]+)/.exec(environ)?.[1];
        if (preload) injected.add(`LD_PRELOAD=${preload}`);
        const maps = await fs.promises.readFile(path.join(base, "maps"), "utf-8");
        for (const line of maps.split("\n")) {
          const m = /\s(\/.*\.(?:so(?:\.\d+)*|dll))(?: \(deleted\))?$/i.exec(line);
          if (m && (matchPath(m[1]) || outsideTrustedRoots(m[1], exe))) injected.add(m[1]);
        }
        note = injected.size ? "Non-system modules/preloads require review; Steam overlays are not proof of injection" : "Readable game mappings checked; no matching signature";
      } catch { note = "Game memory mappings unavailable: permissions or process exited"; }
    }
    const modules = [...injected];
    out.push({ id: `p-${pidStr}`, name: comm, pid: Number(pidStr), path: exe || cmdline, injectedModules: modules, note,
      risk: modules.some((m) => matchPath(m)?.risk === "high") ? "high" : modules.length ? "medium" : hit?.risk ?? "low" });
  }
  return out;
}

export async function collectProcesses(): Promise<TabResult<ProcessEntry>> {
  const started = Date.now();
  try {
    const items = isWin ? await collectWindows() : await collectLinux();
    const rank = { high: 0, medium: 1, low: 2 };
    items.sort((a, b) => rank[a.risk] - rank[b.risk] || a.name.localeCompare(b.name));
    return { generatedAt: new Date().toISOString(), durationMs: Date.now() - started, items };
  } catch (e) {
    return { generatedAt: new Date().toISOString(), durationMs: Date.now() - started, items: [], error: e instanceof Error ? e.message : String(e) };
  }
}
