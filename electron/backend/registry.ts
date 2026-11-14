import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RegistryEntry, TabResult } from "../shared/types";
import { isWin, runCmd } from "./platform";

function run(cmd: string, args: string[], timeout = 20000): Promise<string> {
  return runCmd(cmd, args, timeout, 32 * 1024 * 1024);
}

const EXE_VALUE_RE = /^\s*(.+?\.exe)\s+REG_BINARY\s+/i;

async function collectWindows(): Promise<RegistryEntry[]> {
  const out: RegistryEntry[] = [];
  let id = 0;

  // BAM — Background Activity Moderator: recently executed full paths, incl. deleted tools.
  const bam = await run("reg", [
    "query", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\bam\\State\\UserSettings", "/s",
  ]);
  const bamPaths = new Set<string>();
  for (const line of bam.split(/\r?\n/)) {
    const m = EXE_VALUE_RE.exec(line);
    if (m) bamPaths.add(m[1].trim());
  }
  for (const p of bamPaths) {
    out.push({
      id: `bam-${id++}`,
      key: "HKLM\\...\\bam\\State\\UserSettings",
      value: p,
      source: "BAM",
      risk: /appdata|temp|downloads|desktop/i.test(p) ? "medium" : "low",
      note: "Recently executed",
    });
  }

  // MuiCache — cached display names reveal renamed executables.
  const mui = await run("reg", [
    "query", "HKCU\\Software\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\Shell\\MuiCache", "/s",
  ]);
  const seen = new Set<string>();
  for (const line of mui.split(/\r?\n/)) {
    const m = /((?:[A-Z]:|\\\\)[^"]+\.exe)\.FriendlyAppName/i.exec(line);
    if (m && !seen.has(m[1].toLowerCase())) {
      seen.add(m[1].toLowerCase());
      out.push({
        id: `mui-${id++}`,
        key: "HKCU\\...\\Shell\\MuiCache",
        value: m[1],
        source: "MuiCache",
        risk: /appdata\\local\\temp|appdata\\roaming\\[^\\]+\\[^\\]+\.exe$/i.test(m[1]) ? "medium" : "low",
        note: "Cached executable path",
      });
    }
  }

  // DAM (Desktop Activity Moderator) mirrors BAM for desktop apps.
  const dam = await run("reg", [
    "query", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\dam\\State\\UserSettings", "/s",
  ]);
  const damPaths = new Set<string>();
  for (const line of dam.split(/\r?\n/)) {
    const m = EXE_VALUE_RE.exec(line);
    if (m) damPaths.add(m[1].trim());
  }
  for (const p of damPaths) {
    if (![...bamPaths].some((b) => b.toLowerCase() === p.toLowerCase())) {
      out.push({
        id: `dam-${id++}`,
        key: "HKLM\\...\\dam\\State\\UserSettings",
        value: p,
        source: "DAM",
        risk: "low",
        note: "Desktop activity record",
      });
    }
  }

  // AppCompatCache presence check.
  const appCompat = await run("reg", [
    "query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\AppCompatCache", "/v", "AppCompatCache",
  ]);
  if (appCompat.includes("AppCompatCache")) {
    out.push({
      id: `ac-${id++}`,
      key: "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\AppCompatCache",
      value: "Present (binary shim cache — parse with external tooling for full history)",
      source: "AppCompatCache",
      risk: "low",
      note: "System shim cache exists",
    });
  }
  return out;
}

async function collectLinux(): Promise<RegistryEntry[]> {
  const out: RegistryEntry[] = [];
  let id = 0;

  // Environment audit — LD_PRELOAD-style injection vectors.
  const injectVars = ["LD_PRELOAD", "LD_LIBRARY_PATH", "DYLD_INSERT_LIBRARIES"];
  for (const v of injectVars) {
    const val = process.env[v];
    if (val) {
      out.push({
        id: `env-${id++}`,
        key: v,
        value: val,
        source: "Environment",
        risk: "high",
        note: "Injection-related variable is set globally",
      });
    }
  }
  // User-level env overrides.
  const envFiles = ["/etc/environment", `${process.env.HOME}/.pam_environment`, `${process.env.HOME}/.profile`];
  const { readFile } = await import("node:fs/promises");
  for (const f of envFiles) {
    try {
      const text = await readFile(f, "utf-8");
      for (const line of text.split(/\r?\n/)) {
        if (/^(LD_PRELOAD|LD_LIBRARY_PATH)\s*=/i.test(line.trim())) {
          out.push({
            id: `envf-${id++}`,
            key: f,
            value: line.trim().slice(0, 200),
            source: "Environment file",
            risk: "high",
            note: "Injection variable defined in profile",
          });
        }
      }
    } catch {
      /* file missing */
    }
  }

  // Recent system log entries mentioning injection or the game.
  const journal = await run("journalctl", ["--since", "7 days ago", "--no-pager", "-q", "-o", "short"], 25000);
  const lines = journal.split(/\r?\n/).filter((l) => /(LD_PRELOAD|cs2|anticheat|ptrace)/i.test(l)).slice(-100);
  for (const l of lines) {
    out.push({
      id: `jr-${id++}`,
      key: "journalctl",
      value: l.slice(0, 240),
      source: "System log",
      risk: /LD_PRELOAD/i.test(l) ? "high" : "low",
      note: "Recent system log line",
    });
  }
  return out;
}

export async function collectRegistry(): Promise<TabResult<RegistryEntry>> {
  const started = Date.now();
  try {
    const items = isWin ? await collectWindows() : await collectLinux();
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
