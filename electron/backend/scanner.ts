import fs from "node:fs";
import path from "node:path";
import type { ScanMatch, ScanProgress } from "../shared/types";
import { defaultScanRoots, expand, isWin, shouldSkipDir } from "./platform";
import { loadSignatures, matchPath } from "./signatures";

type ProgressSink = (p: Partial<ScanProgress>) => void;
type ResultSink = (m: ScanMatch) => void;

const MAX_FILES_PER_ROOT = 150_000;
const MAX_SCRIPT_SIZE = 512 * 1024;
const SCRIPT_EXTS = new Set([".lua", ".cfg", ".js", ".txt"]);

let stopRequested = false;
let running = false;
let idCounter = 0;

export function stopScan(): void {
  stopRequested = true;
}

export function isScanning(): boolean {
  return running;
}

function mkId(): string {
  return `m${++idCounter}-${Date.now()}`;
}

async function walk(
  dir: string,
  depth: number,
  state: { scanned: number; stopped: boolean },
  onProgress: ProgressSink,
  onResult: ResultSink,
  checkScripts: boolean,
): Promise<void> {
  if (stopRequested || state.stopped) return;
  if (state.scanned > MAX_FILES_PER_ROOT) return;
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  onProgress({ currentPath: dir });

  for (const entry of entries) {
    if (stopRequested) return;
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) {
        if (depth > 12) continue;
        if (!isWin && ["/proc", "/sys", "/dev", "/run"].includes(full)) continue;
        if (isWin && depth <= 2 && shouldSkipDir(entry.name)) continue;
        await walk(full, depth + 1, state, onProgress, onResult, checkScripts);
      } else if (entry.isFile()) {
        state.scanned++;
        if (state.scanned % 500 === 0) onProgress({ scannedFiles: state.scanned });

        const hit = matchPath(full);
        if (hit) {
          const st = await fs.promises.stat(full).catch(() => null);
          onResult({
            id: mkId(),
            name: entry.name,
            cheat: hit.cheat,
            type: path.extname(entry.name).toLowerCase() || "—",
            size: st?.size ?? 0,
            modified: st?.mtime ? st.mtime.toISOString() : "—",
            path: full,
            risk: hit.risk,
            signature: hit.signature,
          });
        } else if (checkScripts && SCRIPT_EXTS.has(path.extname(entry.name).toLowerCase())) {
          await scanScriptFile(full, entry.name, onResult);
        }
      }
    } catch {
      /* unreadable entry — skip */
    }
  }
}

/** Reads small script/config files and matches cheat code patterns. */
async function scanScriptFile(full: string, name: string, onResult: ResultSink): Promise<void> {
  try {
    const st = await fs.promises.stat(full);
    if (st.size === 0 || st.size > MAX_SCRIPT_SIZE) return;
    const head = await fs.promises.open(full, "r");
    const buf = Buffer.alloc(Math.min(st.size, MAX_SCRIPT_SIZE));
    await head.read(buf, 0, buf.length, 0);
    head.close();
    const text = buf.toString("utf-8");
    if (!text) return;
    for (const pat of loadSignatures().scriptPatterns) {
      try {
        if (new RegExp(pat.regex, "i").test(text)) {
          onResult({
            id: mkId(),
            name,
            cheat: pat.label,
            type: path.extname(name).toLowerCase(),
            size: st.size,
            modified: st.mtime.toISOString(),
            path: full,
            risk: "medium",
            signature: `pattern:${pat.label}`,
          });
          return;
        }
      } catch {
        /* invalid regex in db — ignore */
      }
    }
  } catch {
    /* ignore */
  }
}

export async function runScan(
  roots: string[],
  onProgress: ProgressSink,
  onResult: ResultSink,
): Promise<{ matches: ScanMatch[]; scanned: number; durationMs: number }> {
  if (running) throw new Error("Scan already running");
  running = true;
  stopRequested = false;
  const started = Date.now();
  const matches: ScanMatch[] = [];
  const state = { scanned: 0, stopped: false };

  onProgress({ status: "running", currentPath: "", scannedFiles: 0, found: 0, startedAt: started });

  const resolved = (roots.length ? roots : defaultScanRoots()).map(expand);
  for (const root of resolved) {
    if (stopRequested) break;
    try {
      const st = await fs.promises.stat(root).catch(() => null);
      if (!st) continue;
      const checkScripts = true;
      if (st.isDirectory()) {
        await walk(root, 0, state, onProgress, (m) => {
          matches.push(m);
          onResult(m);
          onProgress({ found: matches.length });
        }, checkScripts);
      } else {
        const hit = matchPath(root);
        if (hit) {
          const m: ScanMatch = {
            id: mkId(),
            name: path.basename(root),
            cheat: hit.cheat,
            type: path.extname(root).toLowerCase(),
            size: st.size,
            modified: st.mtime.toISOString(),
            path: root,
            risk: hit.risk,
            signature: hit.signature,
          };
          matches.push(m);
          onResult(m);
          onProgress({ found: matches.length });
        }
      }
    } catch {
      /* root missing — skip */
    }
  }

  const done: Partial<ScanProgress> = {
    status: stopRequested ? "idle" : "done",
    currentPath: "",
    scannedFiles: state.scanned,
    found: matches.length,
  };
  onProgress(done);
  running = false;
  return { matches, scanned: state.scanned, durationMs: Date.now() - started };
}
