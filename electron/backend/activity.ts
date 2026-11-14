import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { ActivityEntry, RiskLevel, TabResult } from "../shared/types";
import { existingDriveRoots, home, isWin, roamingAppData, shellProfiles, winDir, runCmd } from "./platform";
import { matchPath } from "./signatures";

function run(cmd: string, args: string[], timeout = 15000): Promise<string> {
  return runCmd(cmd, args, timeout, 16 * 1024 * 1024);
}

const CHEAT_CMD_RE = /(neverlose|midnight|nixware|aimware|memesense|exloader|fatality|primordial|skeet|onetap|spirthack|weave|pandora|injector|csghost|\.dll)/i;
const MAX_ENTRIES = 500;

function riskFromPath(p: string): { risk: RiskLevel; cheat: string } {
  const hit = matchPath(p);
  return hit ? { risk: hit.risk, cheat: hit.cheat } : { risk: "low", cheat: "—" };
}

const ACTIVITY_EXT_RE = /\.(exe|rar|zip|7z|ahk|dll|bat|ps1|lnk|msi)$/i;

async function collectWindows(): Promise<ActivityEntry[]> {
  const out: ActivityEntry[] = [];
  let id = 0;

  // Prefetch — evidence of executed programs.
  const prefetchDir = path.join(winDir, "Prefetch");
  try {
    let n = 0;
    for (const f of await fs.promises.readdir(prefetchDir)) {
      if (!f.toLowerCase().endsWith(".pf")) continue;
      const st = await fs.promises.stat(path.join(prefetchDir, f)).catch(() => null);
      const exeName = f.replace(/-[A-F0-9]+\.pf$/i, "");
      const hit = matchPath(exeName);
      out.push({
        id: `pf-${id++}`,
        name: exeName,
        category: "Prefetch",
        time: st?.mtime ? st.mtime.toISOString() : "—",
        path: path.join(prefetchDir, f),
        risk: hit?.risk ?? "low",
      });
      if (++n >= MAX_ENTRIES) break;
    }
  } catch {
    /* prefetch needs admin */
  }

  // Recent files (Explorer recent docs shortcuts).
  const recent = path.join(roamingAppData, "Microsoft", "Windows", "Recent");
  try {
    let n = 0;
    for (const f of await fs.promises.readdir(recent)) {
      if (!f.endsWith(".lnk")) continue;
      const st = await fs.promises.stat(path.join(recent, f)).catch(() => null);
      const hit = matchPath(f);
      out.push({
        id: `rc-${id++}`,
        name: f.replace(/\.lnk$/i, ""),
        category: "Recent",
        time: st?.mtime ? st.mtime.toISOString() : "—",
        path: path.join(recent, f),
        risk: hit?.risk ?? "low",
      });
      if (++n >= MAX_ENTRIES) break;
    }
  } catch {
    /* no recent folder */
  }

  // Downloads / Desktop — freshly downloaded archives and executables.
  for (const dir of [path.join(home, "Downloads"), path.join(home, "Desktop")]) {
    try {
      let n = 0;
      for (const f of await fs.promises.readdir(dir)) {
        if (!ACTIVITY_EXT_RE.test(f) || f.toLowerCase().endsWith(".lnk")) continue;
        const full = path.join(dir, f);
        const st = await fs.promises.stat(full).catch(() => null);
        const hit = matchPath(full);
        out.push({
          id: `dl-${id++}`,
          name: f,
          category: path.basename(dir),
          time: st?.mtime ? st.mtime.toISOString() : "—",
          path: full,
          risk: hit?.risk ?? "low",
        });
        if (++n >= MAX_ENTRIES) break;
      }
    } catch {
      /* folder missing */
    }
  }

  // Recycle bin on every drive — deleted files are a classic evasion signal.
  for (const drive of existingDriveRoots()) {
    const recycle = path.join(drive, "$Recycle.Bin");
    try {
      for (const userBin of await fs.promises.readdir(recycle)) {
        const bin = path.join(recycle, userBin);
        try {
          for (const f of await fs.promises.readdir(bin)) {
            if (!f.startsWith("$I")) continue;
            const info = path.join(bin, f);
            const original = await readRecycleInfo(info);
            const st = await fs.promises.stat(info).catch(() => null);
            const name = original ? path.basename(original) : f;
            const hit = matchPath(original ?? f);
            out.push({
              id: `rb-${id++}`,
              name,
              category: "RecycleBin",
              time: st?.mtime ? st.mtime.toISOString() : "—",
              path: original ?? info,
              risk: hit?.risk ?? "low",
            });
          }
        } catch {
          /* skip bin */
        }
      }
    } catch {
      /* no recycle access */
    }
  }
  return out;
}

/** $I files hold the original path of a deleted item (UTF-16LE, v2 layout at offset 28). */
async function readRecycleInfo(file: string): Promise<string | null> {
  try {
    const buf = await fs.promises.readFile(file);
    if (buf.length < 28) return null;
    const version = buf.readUInt32LE(0);
    const start = version === 2 ? 28 : 24;
    const s = buf.subarray(start).toString("utf16le").replace(/\0.*$/s, "");
    return s || null;
  } catch {
    return null;
  }
}

async function collectLinux(): Promise<ActivityEntry[]> {
  const out: ActivityEntry[] = [];
  let id = 0;

  // Shell history — commands referencing cheats/injectors.
  for (const profile of shellProfiles()) {
    try {
      const st = await fs.promises.stat(profile);
      const text = await fs.promises.readFile(profile, "utf-8");
      const shell = path.basename(profile).replace("_history", "").replace(".", "");
      for (const line of text.split(/\r?\n/).slice(-2000)) {
        if (CHEAT_CMD_RE.test(line)) {
          out.push({
            id: `sh-${id++}`,
            name: line.trim().slice(0, 120),
            category: `History (${shell || "shell"})`,
            time: st.mtime.toISOString(),
            path: profile,
            risk: riskFromPath(line).risk,
          });
        }
        if (out.length >= MAX_ENTRIES) return out;
      }
    } catch {
      /* profile missing */
    }
  }

  out.push(...(await collectRecentFiles()).items);

  // Trash.
  const trash = path.join(home, ".local", "share", "Trash", "files");
  try {
    for (const f of await fs.promises.readdir(trash)) {
      const full = path.join(trash, f);
      const st = await fs.promises.stat(full).catch(() => null);
      const info = await fs.promises.readFile(path.join(home, ".local", "share", "Trash", "info", `${f}.trashinfo`), "utf-8").catch(() => "");
      let original = full;
      try { original = decodeURIComponent(/^Path=(.+)$/m.exec(info)?.[1] ?? full); } catch { /* Malformed trash metadata. */ }
      const hit = matchPath(original);
      out.push({
        id: `tr-${id++}`,
        name: f,
        category: "Trash",
        time: st?.mtime ? st.mtime.toISOString() : "—",
        path: original,
        risk: hit?.risk ?? "low",
      });
      if (out.length >= MAX_ENTRIES) return out;
    }
  } catch {
    /* no trash */
  }

  // tmp cleanup candidates.
  try {
    for (const f of await fs.promises.readdir("/tmp")) {
      const hit = matchPath(f);
      if (hit) {
        out.push({
          id: `tmp-${id++}`,
          name: f,
          category: "Tmp",
          time: "—",
          path: path.join("/tmp", f),
          risk: hit.risk,
        });
      }
    }
  } catch {
    /* ignore */
  }
  return out;
}

export async function collectRecentFiles(): Promise<TabResult<ActivityEntry>> {
  const started = Date.now();
  const items: ActivityEntry[] = [];
  let error: string | undefined;
  try {
    if (isWin) {
      const recent = path.join(roamingAppData, "Microsoft", "Windows", "Recent");
      for (const name of await fs.promises.readdir(recent)) {
        if (!/\.lnk$/i.test(name)) continue;
        const full = path.join(recent, name);
        const st = await fs.promises.stat(full);
        items.push({ id: `recent-${items.length}`, name: name.replace(/\.lnk$/i, ""), category: "Recent", time: st.mtime.toISOString(), path: full, risk: matchPath(name.replace(/\.lnk$/i, ""))?.risk ?? "low" });
      }
    } else {
      const dataHome = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
      const file = path.join(dataHome, "recently-used.xbel");
      if ((await fs.promises.stat(file)).size > 16 * 1024 * 1024) throw new Error("Recent-file database is too large");
      const xml = await fs.promises.readFile(file, "utf-8");
      const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
      for (const m of xml.matchAll(/<bookmark\b([^>]+)>[\s\S]*?<\/bookmark>/g)) {
        const href = /\bhref="([^"]+)"/.exec(m[1])?.[1];
        if (!href) continue;
        const url = new URL(decode(href));
        if (url.protocol !== "file:") continue;
        const full = decodeURIComponent(url.pathname);
        const time = /\b(?:visited|modified|added)="([^"]+)"/.exec(m[1])?.[1] ?? "—";
        items.push({ id: `recent-${items.length}`, name: path.basename(full), category: "Recent (XDG)", time, path: full, risk: matchPath(full)?.risk ?? "low" });
      }
    }
  } catch (e) {
    error = e instanceof Error && "code" in e && e.code === "ENOENT" ? "No retained recent-file database for this user" : e instanceof Error ? e.message : String(e);
  }
  items.sort((a, b) => b.time.localeCompare(a.time));
  return { generatedAt: new Date().toISOString(), durationMs: Date.now() - started, items, error };
}

export async function collectActivity(): Promise<TabResult<ActivityEntry>> {
  const started = Date.now();
  try {
    const items = isWin ? await collectWindows() : await collectLinux();
    items.sort((a, b) => (a.time < b.time ? 1 : -1));
    return { generatedAt: new Date().toISOString(), durationMs: Date.now() - started, items };
  } catch (e) {
    return {
      generatedAt: new Date().toISOString(),
      durationMs: Date.now() - started,
      items: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
