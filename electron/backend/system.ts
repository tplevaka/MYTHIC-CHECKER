import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { DriveInfo, SystemInfo, TabResult, UtilityEntry } from "../shared/types";
import { home, isWin, localAppData, programFiles, programFilesX86, winDir, sysDrive, runCmd } from "./platform";

function run(cmd: string, args: string[], timeout = 20000): Promise<string> {
  return runCmd(cmd, args, timeout, 16 * 1024 * 1024);
}

export async function listDrives(): Promise<DriveInfo[]> {
  const drives: DriveInfo[] = [];
  if (isWin) {
    const out = await run("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      "Get-PSDrive -PSProvider FileSystem | Where-Object {$_.Used -ne $null} | ForEach-Object { \"$($_.Name):|$($_.Free)|$($_.Used)\" }",
    ]);
    for (const line of out.split(/\r?\n/)) {
      const [name, free, used] = line.trim().split("|");
      if (!name || !/^[A-Za-z]:$/.test(name)) continue;
      const freeB = Number(free) || 0;
      const usedB = Number(used) || 0;
      drives.push({
        root: `${name.toUpperCase()}\\`,
        label: `Local disk ${name.toUpperCase()}`,
        system: `${name}\\`.toLowerCase() === sysDrive.toLowerCase(),
        freeGb: Math.round(freeB / 1024 ** 3),
        totalGb: Math.round((freeB + usedB) / 1024 ** 3),
      });
    }
  } else {
    try {
      const mounts = fs.readFileSync("/proc/mounts", "utf-8");
      const seen = new Set<string>();
      for (const line of mounts.split("\n")) {
        const [dev, mount, fstype] = line.split(" ");
        if (!dev || !dev.startsWith("/dev/")) continue;
        if (!["ext4", "xfs", "btrfs", "ntfs3", "ntfs", "vfat"].includes(fstype)) continue;
        if (mount.startsWith("/boot") || seen.has(mount)) continue;
        seen.add(mount);
        try {
          const st = fs.statfsSync(mount);
          drives.push({
            root: mount,
            label: `${dev} (${fstype})`,
            system: mount === "/",
            freeGb: Math.round(Number(st.bavail) * Number(st.bsize) / 1024 ** 3),
            totalGb: Math.round(Number(st.blocks) * Number(st.bsize) / 1024 ** 3),
          });
        } catch {
          drives.push({ root: mount, label: `${dev} (${fstype})`, system: mount === "/" });
        }
      }
    } catch {
      drives.push({ root: "/", label: "rootfs", system: true });
    }
  }
  if (!isWin && !drives.some((d) => d.system)) drives.unshift({ root: "/", label: "rootfs", system: true });
  return drives;
}

const CPU_MACRO_PROCS = /(ahk|autohotkey|pulover|macro|recorder|tinytask|jitbit|macrogamer|x-mouse)/i;

export async function getSystemInfo(): Promise<SystemInfo> {
  const cpus = os.cpus();
  const nets = os.networkInterfaces();
  const localIps: string[] = [];
  for (const name of Object.keys(nets)) {
    for (const ni of nets[name] ?? []) {
      if (!ni.internal && ni.family === "IPv4") localIps.push(ni.address);
    }
  }

  let gpu = "—";
  let monitors = 0;
  let osName = isWin ? `Windows ${os.release()}` : `${os.type()} ${os.release()}`;
  let installDate = "";
  let board = "—";
  let vm = false;
  const macroFlags: string[] = [];

  if (isWin) {
    const ps = await run("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      [
        "$o = Get-CimInstance Win32_OperatingSystem",
        "$b = Get-CimInstance Win32_BaseBoard",
        "$c = Get-CimInstance Win32_ComputerSystem",
        "$g = (Get-CimInstance Win32_VideoController | ForEach-Object { $_.Name }) -join ' | '",
        "$m = @(Get-CimInstance -Namespace root\\wmi -ClassName WmiMonitorID -ErrorAction SilentlyContinue).Count",
        "if ($m -eq 0) { Add-Type -AssemblyName System.Windows.Forms; $m = [System.Windows.Forms.Screen]::AllScreens.Count }",
        "\"OS=$($o.Caption)\"; \"INSTALL=$($o.InstallDate.ToString('o'))\"; \"BOARD=$($b.Manufacturer) $($b.Product)\"",
        "\"MODEL=$($c.Manufacturer) $($c.Model)\"; \"HV=$($c.HypervisorPresent)\"; \"GPU=$g\"; \"MON=$m\"",
      ].join("; "),
    ], 30000);
    const kv = (k: string) => new RegExp(`^${k}=(.*)$`, "m").exec(ps)?.[1]?.trim() ?? "";
    osName = kv("OS") || osName;
    installDate = kv("INSTALL");
    board = kv("BOARD") || "—";
    gpu = kv("GPU") || "—";
    monitors = parseInt(kv("MON"), 10) || 0;
    vm = /(virtualbox|vmware|qemu|kvm|virtual machine|hyper-v|xen|parallels)/i.test(`${kv("MODEL")} ${board}`);

    const tasklist = await run("tasklist", ["/fo", "csv"]);
    for (const line of tasklist.split(/\r?\n/)) {
      const m = CPU_MACRO_PROCS.exec(line);
      if (m && !macroFlags.includes(m[0])) macroFlags.push(m[0]);
    }
  } else {
    const lspci = await run("bash", ["-lc", "lspci 2>/dev/null | grep -i 'vga\\|3d' || true"]);
    gpu = lspci.split("\n")[0]?.trim() || "—";
    const xrandr = await run("bash", ["-lc", "xrandr 2>/dev/null | grep -c ' connected ' || true"]);
    monitors = parseInt(xrandr.trim(), 10) || 0;
    const procs = await run("bash", ["-lc", "ps -e -o comm= 2>/dev/null | grep -Ei 'autohotkey|xdotool|input-remapper|evtest' || true"]);
    for (const p of procs.split(/\r?\n/).filter(Boolean)) {
      macroFlags.push(p.trim());
    }
    try {
      board = `${fs.readFileSync("/sys/class/dmi/id/board_vendor", "utf-8").trim()} ${fs.readFileSync("/sys/class/dmi/id/board_name", "utf-8").trim()}`;
    } catch {
      /* no dmi */
    }
    const virt = await run("bash", ["-lc", "systemd-detect-virt 2>/dev/null || true"]);
    vm = Boolean(virt.trim()) && virt.trim() !== "none";
  }

  return {
    os: osName,
    kernel: os.version(),
    cpu: cpus[0]?.model?.trim() ?? "—",
    cores: cpus.length,
    gpu,
    ramGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    monitors,
    uptimeHours: Math.round(os.uptime() / 3600),
    bootTime: new Date(Date.now() - os.uptime() * 1000).toISOString(),
    installDate,
    board,
    vm,
    hostname: os.hostname(),
    localIps,
    macroFlags,
  };
}

interface UtilityDef {
  id: string;
  group: UtilityEntry["group"];
  name: string;
  description: string;
  downloadUrl: string;
  /** Executable names searched in Program Files, AppData\Programs, Downloads, Desktop. */
  exeNames?: string[];
  /** Windows built-in fallback that always works without installing anything. */
  builtin?: { cmd: string; args: string[] };
}

const explorer = (target: string) => ({ cmd: "explorer.exe", args: [target] });

const UTILITIES: UtilityDef[] = [
  { id: "everything", group: "files", name: "Everything", description: "Instant file-name search across all drives", downloadUrl: "https://www.voidtools.com/downloads/", exeNames: ["Everything.exe", "Everything64.exe"] },
  { id: "shellbag", group: "files", name: "Shellbag Analyzer", description: "Folders opened in Explorer, including deleted ones", downloadUrl: "https://ericzimmerman.github.io/", exeNames: ["ShellBagsExplorer.exe", "ShellBagsView.exe", "SBECmd.exe"] },
  { id: "openfiles", group: "files", name: "Opened files", description: "Files currently opened by processes", downloadUrl: "https://www.nirsoft.net/utils/opened_files_view.html", exeNames: ["OpenedFilesView.exe"], builtin: { cmd: "resmon.exe", args: [] } },
  { id: "runhistory", group: "files", name: "Launch history", description: "What was run and how many times — Windows counters", downloadUrl: "https://www.nirsoft.net/utils/win_prefetch_view.html", exeNames: ["WinPrefetchView.exe", "UserAssistView.exe"], builtin: explorer(path.join(winDir, "Prefetch")) },
  { id: "executed", group: "files", name: "Executed programs", description: "Full history of launched programs", downloadUrl: "https://www.nirsoft.net/utils/executed_programs_list.html", exeNames: ["ExecutedProgramsList.exe"] },
  { id: "timeline", group: "files", name: "Activity timeline", description: "Combined timeline of actions for a chosen period", downloadUrl: "https://www.nirsoft.net/utils/computer_activity_view.html", exeNames: ["LastActivityView.exe"] },
  { id: "recentfiles", group: "files", name: "Recent files", description: "Recently opened files from the taskbar / Explorer", downloadUrl: "https://www.nirsoft.net/utils/recent_files_view.html", exeNames: ["RecentFilesView.exe"], builtin: explorer("shell:recent") },
  { id: "openfolders", group: "files", name: "Opened folders", description: "Folder navigation history with dates", downloadUrl: "https://www.nirsoft.net/utils/shell_bags_view.html", exeNames: ["ShellBagsView.exe"], builtin: explorer("shell:::{22877a6d-37a1-461a-91b0-dbda5aaebc99}") },
  { id: "browserhistory", group: "browser", name: "Browser history", description: "Visit history of every installed browser", downloadUrl: "https://www.nirsoft.net/utils/browsing_history_view.html", exeNames: ["BrowsingHistoryView.exe"] },
  { id: "browserdownloads", group: "browser", name: "Browser downloads", description: "What was downloaded and from where, including deleted", downloadUrl: "https://www.nirsoft.net/utils/web_browser_downloads_view.html", exeNames: ["BrowserDownloadsView.exe"], builtin: explorer(path.join(home, "Downloads")) },
  { id: "systeminformer", group: "game", name: "System Informer", description: "Game processes, modules and handles", downloadUrl: "https://systeminformer.io/", exeNames: ["SystemInformer.exe", "ProcessHacker.exe"] },
  { id: "registryfinder", group: "registry", name: "Registry Finder", description: "Search registry hives, including hidden keys", downloadUrl: "https://registry-finder.com/", exeNames: ["RegistryFinder.exe"], builtin: { cmd: "regedit.exe", args: [] } },
];

/** Windows system apps used by the Other tab; ids are the only thing the renderer can send. */
const SYSTEM_ACTIONS: Record<string, { cmd: string; args: string[] }> = {
  datausage: explorer("ms-settings:datausage"),
  nvidia: explorer("shell:AppsFolder\\NVIDIACorp.NVIDIAControlPanel_56jybvy8sckqj!NVIDIACorp.NVIDIAControlPanel"),
  services: { cmd: "mmc.exe", args: ["services.msc"] },
  mouse: { cmd: "control.exe", args: ["main.cpl"] },
  osk: { cmd: "osk.exe", args: [] },
  taskmgr: { cmd: "taskmgr.exe", args: [] },
};

function searchDirs(): string[] {
  return [
    programFiles,
    programFilesX86,
    path.join(localAppData, "Programs"),
    localAppData,
    path.join(home, "Downloads"),
    path.join(home, "Desktop"),
    path.join(home, "Documents"),
  ];
}

async function findTools(): Promise<Map<string, string>> {
  const wanted = new Set(UTILITIES.flatMap((u) => u.exeNames ?? []).map((name) => name.toLowerCase()));
  const found = new Map<string, string>();
  const visited = new Set<string>();
  const scan = async (dir: string, depth: number): Promise<void> => {
    if (visited.has(dir.toLowerCase())) return;
    visited.add(dir.toLowerCase());
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const name = e.name.toLowerCase();
      if (e.isFile() && wanted.has(name) && !found.has(name)) found.set(name, path.join(dir, e.name));
    }
    if (depth === 0) return;
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith(".") && !e.name.startsWith("$") && e.name !== "node_modules") await scan(path.join(dir, e.name), depth - 1);
    }
  };
  for (const dir of searchDirs()) await scan(dir, 2);
  return found;
}

function spawnDetached(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { detached: true, stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("spawn", () => { child.unref(); resolve(true); });
  });
}

const utilityCache = new Map<string, string>();

export async function getUtilities(): Promise<TabResult<UtilityEntry>> {
  const started = Date.now();
  const executables = isWin ? await findTools() : new Map<string, string>();
  if (isWin) {
    const tools = fs.existsSync(path.join(process.resourcesPath || "", "tools"))
      ? path.join(process.resourcesPath, "tools") : path.join(__dirname, "../assets/tools");
    for (const [name, relative] of [["RecentFilesView.exe", "recentfilesview/RecentFilesView.exe"], ["SystemInformer.exe", "systeminformer/amd64/SystemInformer.exe"]]) {
      const bundled = path.join(tools, relative);
      if (fs.existsSync(bundled)) executables.set(name.toLowerCase(), bundled);
    }
  }
  const items: UtilityEntry[] = UTILITIES.map((u) => {
    const found = (u.exeNames ?? []).map((name) => executables.get(name.toLowerCase())).find(Boolean) ?? "";
    utilityCache.set(u.id, found);
    return {
      id: u.id,
      group: u.group,
      name: u.name,
      description: u.description,
      downloadUrl: u.downloadUrl,
      installed: Boolean(found),
      builtin: isWin ? Boolean(u.builtin) : ["recentfiles", "systeminformer"].includes(u.id),
      path: found,
    };
  });
  return { generatedAt: new Date().toISOString(), durationMs: Date.now() - started, items };
}

export type UtilityAction = "launched" | "builtin" | "internal" | "download" | "failed";

/** Launches the tool if found, otherwise the Windows built-in equivalent, otherwise its download page. */
export async function runUtility(
  id: string,
  openExternal: (url: string) => Promise<void>,
  openPath: (p: string) => Promise<string>,
): Promise<{ ok: boolean; action: UtilityAction }> {
  const sys = Object.hasOwn(SYSTEM_ACTIONS, id) ? SYSTEM_ACTIONS[id] : undefined;
  if (sys) {
    if (!isWin) return { ok: false, action: "failed" };
    if (id === "nvidia" && !(await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", "(Get-AppxPackage -Name NVIDIACorp.NVIDIAControlPanel).PackageFullName"])).trim()) return { ok: false, action: "failed" };
    return isWin && await spawnDetached(sys.cmd, sys.args) ? { ok: true, action: "builtin" } : { ok: false, action: "failed" };
  }

  const def = UTILITIES.find((u) => u.id === id);
  if (!def) return { ok: false, action: "failed" };
  if (!isWin) return ["recentfiles", "systeminformer"].includes(id) ? { ok: true, action: "internal" } : { ok: false, action: "failed" };
  if (!utilityCache.has(id)) await getUtilities();
  const exe = utilityCache.get(id) ?? "";
  if (exe && !(await openPath(exe))) return { ok: true, action: "launched" };
  if (isWin && def.builtin && await spawnDetached(def.builtin.cmd, def.builtin.args)) return { ok: true, action: "builtin" };
  if (["recentfiles", "systeminformer"].includes(id)) return { ok: false, action: "failed" };
  await openExternal(def.downloadUrl);
  return { ok: true, action: "download" };
}
