import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const isWin = process.platform === "win32";
export const isLinux = process.platform === "linux";

export const home = os.homedir();
export const tmpdir = os.tmpdir();

const env = process.env;
export const sysDrive = (env.SystemDrive || "C:") + "\\";
export const winDir = env.SystemRoot || env.windir || path.join(sysDrive, "Windows");
export const programFiles = env.ProgramW6432 || env.ProgramFiles || path.join(sysDrive, "Program Files");
export const programFilesX86 = env["ProgramFiles(x86)"] || path.join(sysDrive, "Program Files (x86)");
export const programData = env.ProgramData || path.join(sysDrive, "ProgramData");
export const localAppData = env.LOCALAPPDATA || path.join(home, "AppData", "Local");
export const roamingAppData = env.APPDATA || path.join(home, "AppData", "Roaming");
export const hostsFile = isWin ? path.join(winDir, "System32", "drivers", "etc", "hosts") : "/etc/hosts";

/** Fixed drive roots (C:\, D:\ …) that actually exist on this machine. */
export function existingDriveRoots(): string[] {
  if (!isWin) return ["/"];
  const out: string[] = [];
  for (let c = 67; c <= 90; c++) {
    const root = `${String.fromCharCode(c)}:\\`;
    try {
      fs.accessSync(root);
      out.push(root);
    } catch {
      /* no such drive */
    }
  }
  return out;
}

let consoleLabel: string | null = null;

/** Console tools (reg, tasklist, fsutil) print in the OEM code page, which differs per Windows locale. */
function consoleEncoding(): string {
  if (consoleLabel) return consoleLabel;
  consoleLabel = "utf-8";
  if (!isWin) return consoleLabel;
  try {
    const out = execFileSync("cmd.exe", ["/d", "/c", "chcp"], { encoding: "latin1", windowsHide: true, timeout: 5000 });
    const cp = /(\d{3,5})/.exec(out)?.[1] ?? "";
    const map: Record<string, string> = {
      "866": "ibm866", "65001": "utf-8", "1251": "windows-1251", "1250": "windows-1250",
      "1252": "windows-1252", "437": "windows-1252", "850": "windows-1252", "1254": "windows-1254",
      "936": "gbk", "932": "shift_jis", "949": "euc-kr", "950": "big5",
    };
    consoleLabel = map[cp] ?? "utf-8";
  } catch {
    /* keep utf-8 */
  }
  return consoleLabel;
}

function decode(buf: Buffer, label: string): string {
  try {
    return new TextDecoder(label).decode(buf);
  } catch {
    return buf.toString("utf-8");
  }
}

/** Runs a system command and returns decoded stdout ("" on failure). */
export function runCmd(cmd: string, args: string[], timeout = 20000, maxBuffer = 32 * 1024 * 1024): Promise<string> {
  const isPs = /^powershell(\.exe)?$/i.test(cmd);
  const finalArgs = [...args];
  if (isPs) {
    const i = finalArgs.findIndex((a) => /^-command$/i.test(a));
    if (i >= 0 && finalArgs[i + 1]) {
      finalArgs[i + 1] = `[Console]::OutputEncoding=[Text.Encoding]::UTF8; $ProgressPreference='SilentlyContinue'; ${finalArgs[i + 1]}`;
    }
  }
  return new Promise((resolve) => {
    execFile(cmd, finalArgs, { timeout, windowsHide: true, maxBuffer, encoding: "buffer" }, (err, stdout) => {
      const out = stdout && stdout.length ? decode(stdout, isPs ? "utf-8" : consoleEncoding()) : "";
      resolve(err && !out ? "" : out);
    });
  });
}

export function expand(p: string): string {
  if (p === "~") return home;
  if (p.startsWith("~/") || p.startsWith("~\\")) return path.join(home, p.slice(2));
  return p;
}

export function userDir(...parts: string[]): string {
  return path.join(home, ...parts);
}

/** Default scan roots per platform. */
export function defaultScanRoots(): string[] {
  if (isWin) {
    const sys = sysDrive.toUpperCase();
    return [
      path.join(home, "Downloads"),
      path.join(home, "Desktop"),
      path.join(home, "Documents"),
      tmpdir,
      roamingAppData,
      localAppData,
      programData,
      ...existingDriveRoots().filter((r) => r.toUpperCase() !== sys),
    ];
  }
  return [
    userDir("Downloads"),
    userDir("Desktop"),
    "/tmp",
    userDir(".config"),
    userDir(".local", "share"),
    userDir(".steam"),
    userDir(".var"),
  ];
}

/** Known cheat-adjacent folders that get full-depth scans on Windows. */
export const winDeepWhitelist = [
  "appdata",
  "programdata",
  "downloads",
  "desktop",
  "documents",
];

/** Directories skipped during root-level enumeration (too large / irrelevant). */
export function shouldSkipDir(name: string): boolean {
  const n = name.toLowerCase();
  if (n.startsWith(".")) return true;
  const skip = [
    "windows", "program files", "program files (x86)", "program files(x86)",
    "$recycle.bin", "system volume information", "recovery", "perflogs",
    "node_modules", ".git", ".svn", "microsoft", "google", "mozilla",
    "intel", "nvidia", "amd", "steamapps", "common files",
  ];
  return skip.some((s) => n === s || n.startsWith(s));
}

export function steamVdfPaths(): string[] {
  if (isWin) {
    const roots = [
      path.join(programFilesX86, "Steam"),
      path.join(programFiles, "Steam"),
      path.join(home, "Steam"),
      ...existingDriveRoots().flatMap((d) => [
        path.join(d, "Steam"),
        path.join(d, "Program Files (x86)", "Steam"),
        path.join(d, "Games", "Steam"),
      ]),
    ];
    return roots.map((r) => path.join(r, "config", "loginusers.vdf"));
  }
  return [
    userDir(".steam", "steam", "config", "loginusers.vdf"),
    userDir(".local", "share", "Steam", "config", "loginusers.vdf"),
    userDir(".var", "app", "com.valvesoftware.Steam", ".local", "share", "Steam", "config", "loginusers.vdf"),
  ];
}

function listDirs(dir: string): string[] {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch {
    return [];
  }
}

export function browserHistoryPaths(): { browser: string; profile: string; file: string }[] {
  const out: { browser: string; profile: string; file: string }[] = [];
  const chromium = (browser: string, userData: string) => {
    for (const p of listDirs(userData)) {
      if (p === "Default" || /^Profile \d+$/.test(p) || p === "Guest Profile") {
        out.push({ browser, profile: p, file: path.join(userData, p, "History") });
      }
    }
  };
  const opera = (browser: string, base: string) => {
    out.push({ browser, profile: path.basename(base), file: path.join(base, "History") });
    chromium(browser, base);
  };
  const firefox = (browser: string, profilesDir: string) => {
    for (const p of listDirs(profilesDir)) {
      out.push({ browser, profile: p, file: path.join(profilesDir, p, "places.sqlite") });
    }
  };
  if (isWin) {
    const local = localAppData;
    chromium("Chrome", path.join(local, "Google", "Chrome", "User Data"));
    chromium("Edge", path.join(local, "Microsoft", "Edge", "User Data"));
    chromium("Brave", path.join(local, "BraveSoftware", "Brave-Browser", "User Data"));
    chromium("Yandex", path.join(local, "Yandex", "YandexBrowser", "User Data"));
    chromium("Vivaldi", path.join(local, "Vivaldi", "User Data"));
    chromium("Chromium", path.join(local, "Chromium", "User Data"));
    opera("Opera", path.join(roamingAppData, "Opera Software", "Opera Stable"));
    opera("Opera GX", path.join(roamingAppData, "Opera Software", "Opera GX Stable"));
    firefox("Firefox", path.join(roamingAppData, "Mozilla", "Firefox", "Profiles"));
    firefox("Waterfox", path.join(roamingAppData, "Waterfox", "Profiles"));
  } else {
    chromium("Chrome", userDir(".config", "google-chrome"));
    chromium("Chromium", userDir(".config", "chromium"));
    chromium("Brave", userDir(".config", "BraveSoftware", "Brave-Browser"));
    chromium("Edge", userDir(".config", "microsoft-edge"));
    chromium("Vivaldi", userDir(".config", "vivaldi"));
    opera("Opera", userDir(".config", "opera"));
    for (const p of listDirs(userDir(".mozilla", "firefox"))) {
      out.push({ browser: "Firefox", profile: p, file: path.join(userDir(".mozilla", "firefox"), p, "places.sqlite") });
    }
  }
  return out;
}

export function shellProfiles(): string[] {
  if (isWin) return [];
  return [
    userDir(".bash_history"),
    userDir(".zsh_history"),
    userDir(".local", "share", "fish", "fish_history"),
  ];
}
