import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { RenamedEntry, RiskLevel, TabResult } from "../shared/types";
import { home, isWin, tmpdir, runCmd } from "./platform";
import { matchPath } from "./signatures";

function run(cmd: string, args: string[], timeout = 45000): Promise<string> {
  return runCmd(cmd, args, timeout, 96 * 1024 * 1024);
}

const EXEC_EXTS = new Set([".exe", ".dll", ".sys", ".scr", ".com", ".bat", ".cmd"]);
const MAX_DEPTH = 6;
const MAX_FILES = 40_000;
const USN_REASON_RENAME_OLD = 0x00001000;
const USN_REASON_RENAME_NEW = 0x00002000;
const USN_REASON_DELETE = 0x00000200;
const USN_REASON_CREATE = 0x00000100;

/* ---------------- Windows: NTFS USN Journal ---------------- */

interface UsnRecord {
  name: string;
  reason: number;
  time: string;
}

function parseUsnCsv(text: string): UsnRecord[] {
  const records: UsnRecord[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.startsWith('"')) continue;
    // Usn,"FileName","FileNameLength",Reason,"TimeStamp",...
    // Quoting of fields varies by OS version, so stay tolerant.
    const m = /^"([^"]*)","((?:[^"]|"")*)","?(\d+)"?,"?0x([0-9A-Fa-f]+)"?/.exec(line);
    if (!m) continue;
    records.push({ name: m[2].replace(/""/g, '"'), reason: parseInt(m[4], 16), time: m[1] });
  }
  return records;
}

async function collectUsn(): Promise<RenamedEntry[]> {
  const out: RenamedEntry[] = [];
  let id = 0;
  const systemDrive = process.env.SystemDrive || "C:";

  const csv = await run("fsutil", ["usn", "readjournal", systemDrive, "csv"]);
  if (!csv) return out;
  const records = parseUsnCsv(csv);
  // Keep the tail — recent history is what matters for a check.
  const window = records.slice(-400_000);

  const push = (name: string, original: string, source: string, risk: RiskLevel, time: string) => {
    if (out.length >= 500) return;
    out.push({
      id: `usn-${id++}`,
      name,
      originalName: original,
      realType: "—",
      declaredExt: path.extname(name).toLowerCase() || "(none)",
      path: `${systemDrive}\\ (USN journal, record time ${time})`,
      size: 0,
      risk,
      source,
    });
  };

  let pendingOldName: string | null = null;
  let pendingOldTime = "";
  for (const rec of window) {
    if (rec.reason & USN_REASON_RENAME_OLD) {
      pendingOldName = rec.name;
      pendingOldTime = rec.time;
      continue;
    }
    if (rec.reason & USN_REASON_RENAME_NEW && pendingOldName) {
      const oldHit = matchPath(pendingOldName);
      const newHit = matchPath(rec.name);
      if (oldHit && oldHit.signature.startsWith("file:")) {
        // e.g. neverlose.exe -> Titlebar.tsx
        push(rec.name, pendingOldName, "USN rename", oldHit.risk, pendingOldTime);
      } else if (newHit && newHit.signature.startsWith("file:") && pendingOldName.toLowerCase() !== rec.name.toLowerCase()) {
        push(rec.name, pendingOldName, "USN rename (to cheat name)", newHit.risk, pendingOldTime);
      }
      pendingOldName = null;
      continue;
    }
    // Deletion of a cheat file right before the check is an evasion signal.
    if (rec.reason & USN_REASON_DELETE && !(rec.reason & USN_REASON_CREATE)) {
      const hit = matchPath(rec.name);
      if (hit && hit.signature.startsWith("file:") && !out.some((o) => o.originalName === rec.name)) {
        push(rec.name, rec.name, "USN delete", hit.risk, rec.time);
      }
    }
  }
  return out;
}

/* ---------------- magic-number scan (both platforms) ---------------- */

async function sniffMagic(file: string): Promise<string | null> {
  try {
    const fd = await fs.promises.open(file, "r");
    const buf = Buffer.alloc(4);
    await fd.read(buf, 0, 4, 0);
    fd.close();
    if (buf[0] === 0x4d && buf[1] === 0x5a) return "PE/Win32";
    if (buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46) return "ELF/Linux";
    return null;
  } catch {
    return null;
  }
}

async function collectMagic(items: RenamedEntry[], startId: number): Promise<number> {
  let id = startId;
  let scanned = 0;
  const roots = isWin
    ? [path.join(home, "Downloads"), path.join(home, "Desktop"), path.join(home, "Documents"), path.join(home, "Pictures"), path.join(home, "AppData", "Local", "Temp"), tmpdir]
    : [path.join(home, "Downloads"), path.join(home, "Desktop"), "/tmp", path.join(home, ".config")];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_DEPTH || scanned > MAX_FILES || items.length >= 600) return;
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (scanned > MAX_FILES || items.length >= 600) return;
      const full = path.join(dir, e.name);
      try {
        if (e.isDirectory()) {
          if (!e.name.startsWith(".")) await walk(full, depth + 1);
        } else if (e.isFile()) {
          scanned++;
          const ext = path.extname(e.name).toLowerCase();
          if (EXEC_EXTS.has(ext)) continue;
          if (!/\.(jpg|jpeg|png|gif|txt|pdf|mp4|mp3|docx|xlsx|zip|rar|7z|log|cfg|json|csv|tsx|jsx)$/i.test(ext)) continue;
          const magic = await sniffMagic(full);
          if (magic) {
            const st = await fs.promises.stat(full).catch(() => null);
            const risk: RiskLevel = ext === ".jpg" || ext === ".png" || ext === ".jpeg" || ext === ".tsx" || ext === ".jsx" ? "high" : "medium";
            items.push({
              id: `mg-${id++}`,
              name: e.name,
              realType: magic,
              declaredExt: ext || "(none)",
              path: full,
              size: st?.size ?? 0,
              risk,
              source: "Magic header",
            });
          }
        }
      } catch {
        /* skip */
      }
    }
  }

  for (const r of roots) {
    if (fs.existsSync(r)) await walk(r, 0);
  }
  return id;
}

/** Linux Trash metadata records the original path of deleted files. */
async function collectTrashInfo(items: RenamedEntry[], startId: number): Promise<number> {
  let id = startId;
  const infoDir = path.join(home, ".local", "share", "Trash", "info");
  try {
    for (const f of await fs.promises.readdir(infoDir)) {
      if (!f.endsWith(".trashinfo")) continue;
      const text = await fs.promises.readFile(path.join(infoDir, f), "utf-8").catch(() => "");
      const orig = /^Path=(.+)$/m.exec(text)?.[1];
      if (!orig) continue;
      const hit = matchPath(orig);
      if (hit) {
        items.push({
          id: `tr-${id++}`,
          name: path.basename(f, ".trashinfo"),
          originalName: decodeURIComponent(orig),
          realType: "—",
          declaredExt: path.extname(orig).toLowerCase() || "(none)",
          path: path.join(infoDir, f),
          size: 0,
          risk: hit.risk,
          source: "Trash metadata",
        });
      }
    }
  } catch {
    /* no trash */
  }
  return id;
}

export async function collectRenamed(): Promise<TabResult<RenamedEntry>> {
  const started = Date.now();
  const items: RenamedEntry[] = [];
  let id = 0;
  try {
    if (isWin) {
      items.push(...(await collectUsn()));
      id = items.length;
    } else {
      id = await collectTrashInfo(items, id);
    }
    await collectMagic(items, id);
    items.sort((a, b) => (a.risk === b.risk ? 0 : a.risk === "high" ? -1 : 1));
  } catch {
    /* best-effort collectors */
  }
  return { generatedAt: new Date().toISOString(), durationMs: Date.now() - started, items };
}
