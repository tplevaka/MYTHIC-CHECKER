import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { SiteEntry, TabResult } from "../shared/types";
import { browserHistoryPaths, hostsFile, isWin } from "./platform";
import { loadSignatures } from "./signatures";

const MAX_FILE = 64 * 1024 * 1024;

/**
 * Browser history databases are locked SQLite files; rather than pulling a
 * native sqlite dependency we scan the raw bytes for known cheat domains.
 * URLs appear as plain UTF-8 strings in the file, which is sufficient for
 * detection purposes.
 */
function scanBuffer(buf: Buffer, domains: string[]): Set<string> {
  const found = new Set<string>();
  const text = buf.toString("latin1").toLowerCase();
  for (const d of domains) {
    if (text.includes(d.toLowerCase())) found.add(d);
  }
  return found;
}

function scanHostsFile(file: string): string[] {
  try {
    const text = fs.readFileSync(file, "utf-8");
    return loadSignatures()
      .cheatDomains.filter((d) => text.toLowerCase().includes(d));
  } catch {
    return [];
  }
}

/** Reads a file even while the browser holds it open (falls back to a shadow copy). */
async function readLocked(file: string): Promise<Buffer | null> {
  const st = await fs.promises.stat(file).catch(() => null);
  if (!st || st.size === 0 || st.size > MAX_FILE) return null;
  try {
    return await fs.promises.readFile(file);
  } catch {
    /* locked */
  }
  const tmp = path.join(os.tmpdir(), `mythic-${process.pid}-${Date.now()}.db`);
  try {
    await fs.promises.copyFile(file, tmp);
  } catch {
    if (!isWin) return null;
    try {
      execFileSync("esentutl.exe", ["/y", file, "/vss", "/d", tmp, "/o"], { timeout: 20000, windowsHide: true });
    } catch {
      return null;
    }
  }
  try {
    return await fs.promises.readFile(tmp);
  } catch {
    return null;
  } finally {
    fs.promises.unlink(tmp).catch(() => {});
  }
}

export async function collectSites(): Promise<TabResult<SiteEntry>> {
  const started = Date.now();
  const items: SiteEntry[] = [];
  const domains = loadSignatures().cheatDomains;
  let id = 0;

  for (const loc of browserHistoryPaths()) {
    const found = new Set<string>();
    for (const file of [loc.file, `${loc.file}-wal`, `${loc.file}-journal`]) {
      const buf = await readLocked(file);
      if (buf) for (const d of scanBuffer(buf, domains)) found.add(d);
    }
    for (const d of found) {
      items.push({
        id: `st-${id++}`,
        domain: d,
        category: "Cheat resource",
        browser: loc.browser,
        profile: loc.profile,
        risk: "high",
      });
    }
  }

  // hosts file entries can be redirects used by cheat launchers.
  const hosts = hostsFile;
  for (const d of scanHostsFile(hosts)) {
    items.push({
      id: `st-${id++}`,
      domain: d,
      category: "hosts redirect",
      browser: "system",
      profile: hosts,
      risk: "medium",
    });
  }

  return { generatedAt: new Date().toISOString(), durationMs: Date.now() - started, items };
}
