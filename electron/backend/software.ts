import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import type { RiskLevel, SoftwareEntry, TabResult } from "../shared/types";
import { isWin, runCmd } from "./platform";
import { matchPath } from "./signatures";

function run(cmd: string, args: string[], timeout = 20000): Promise<string> {
  return runCmd(cmd, args, timeout, 16 * 1024 * 1024);
}

const SUSPICIOUS_RE = /(cheat|hack|inject|aimbot|wallhack|esp|spoofer|spoofer|bypass|exloader|neverlose|nixware|aimware|memesense|midnight|gamesense|skeet)/i;

function assess(name: string): { risk: RiskLevel; note: string } {
  const hit = matchPath(name);
  if (hit) return { risk: hit.risk, note: hit.cheat };
  if (SUSPICIOUS_RE.test(name)) return { risk: "medium", note: "Suspicious name" };
  return { risk: "low", note: "—" };
}

async function collectWindows(): Promise<SoftwareEntry[]> {
  const out: SoftwareEntry[] = [];
  let id = 0;
  const roots = [
    "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
    "HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  ];
  const seen = new Set<string>();
  for (const root of roots) {
    const regOut = await run("reg", ["query", root, "/s", "/f", "DisplayName"]);
    let name = "", version = "", date = "";
    const flush = () => {
      if (name && !seen.has(name.toLowerCase())) {
        seen.add(name.toLowerCase());
        const a = assess(name);
        out.push({ id: `sw-${id++}`, name, version, installDate: date, source: root.split("\\")[0], risk: a.risk, note: a.note });
      }
      name = version = date = "";
    };
    for (const line of regOut.split(/\r?\n/)) {
      const n = /DisplayName\s+REG_SZ\s+(.+)/i.exec(line);
      if (n) { flush(); name = n[1].trim(); continue; }
      const v = /DisplayVersion\s+REG_SZ\s+(.+)/i.exec(line);
      if (v) { version = v[1].trim(); continue; }
      const d = /InstallDate\s+REG_SZ\s+(\d{8})/.exec(line);
      if (d) {
        date = `${d[1].slice(0, 4)}-${d[1].slice(4, 6)}-${d[1].slice(6, 8)}`;
      }
    }
    flush();
  }

  // Recent installers sitting in Downloads / Desktop.
  const { homedir } = await import("node:os");
  for (const dir of [path.join(homedir(), "Downloads"), path.join(homedir(), "Desktop")]) {
    try {
      for (const f of await fs.promises.readdir(dir)) {
        if (!/\.(exe|msi|zip|rar|7z)$/i.test(f)) continue;
        const st = await fs.promises.stat(path.join(dir, f)).catch(() => null);
        const a = assess(f);
        if (a.risk !== "low" || /setup|install|installer/i.test(f)) {
          out.push({
            id: `inst-${id++}`,
            name: `[installer] ${f}`,
            version: "—",
            installDate: st?.mtime ? st.mtime.toISOString().slice(0, 10) : "—",
            source: "Recent installers",
            risk: a.risk,
            note: a.note,
          });
        }
      }
    } catch {
      /* dir missing */
    }
  }
  return out;
}

async function collectLinux(): Promise<SoftwareEntry[]> {
  const out: SoftwareEntry[] = [];
  let id = 0;
  // .desktop files are the distro-agnostic installed-app index.
  const dirs = ["/usr/share/applications", "/var/lib/flatpak/exports/share/applications", path.join(process.env.HOME || "", ".local/share/applications")];
  for (const dir of dirs) {
    try {
      for (const f of await fs.promises.readdir(dir)) {
        if (!f.endsWith(".desktop")) continue;
        const text = await fs.promises.readFile(path.join(dir, f), "utf-8").catch(() => "");
        const n = /^Name=(.+)$/m.exec(text);
        const name = n?.[1]?.trim() || f.replace(/\.desktop$/, "");
        const a = assess(name);
        out.push({ id: `sw-${id++}`, name, version: "—", installDate: "—", source: dir, risk: a.risk, note: a.note });
      }
    } catch {
      /* dir missing */
    }
  }
  return out;
}

export async function collectSoftware(): Promise<TabResult<SoftwareEntry>> {
  const started = Date.now();
  try {
    const items = isWin ? await collectWindows() : await collectLinux();
    items.sort((a, b) => (a.risk === b.risk ? a.name.localeCompare(b.name) : a.risk === "high" ? -1 : 1));
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
