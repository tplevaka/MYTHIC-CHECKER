import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { OtherCheck, TabResult } from "../shared/types";
import { hostsFile, isWin, sysDrive, winDir, runCmd } from "./platform";
import { loadSignatures, matchPath, matchProcess } from "./signatures";
import { collectActivity } from "./activity";

function run(cmd: string, args: string[], timeout = 15000): Promise<string> {
  return runCmd(cmd, args, timeout, 8 * 1024 * 1024);
}

function exists(p: string): boolean {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export async function collectOther(): Promise<TabResult<OtherCheck>> {
  const started = Date.now();
  const checks: OtherCheck[] = [];
  const domains = loadSignatures().cheatDomains;

  // 1. Hosts file audit.
  const hosts = hostsFile;
  let hostsHits = 0;
  try {
    const text = fs.readFileSync(hosts, "utf-8").toLowerCase();
    hostsHits = domains.filter((d) => text.includes(d)).length;
  } catch {
    /* unreadable */
  }
  checks.push({
    id: "hosts",
    name: "Hosts file audit",
    status: hostsHits > 0 ? "warn" : "ok",
    detail: hostsHits > 0 ? `${hostsHits} cheat-domain entries in hosts` : "No cheat domains in hosts file",
  });

  // 2. Secure Boot / kernel integrity.
  if (isWin) {
    const sb = await run("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      "try { if (Confirm-SecureBootUEFI -ErrorAction Stop) { 'True' } else { 'False' } } catch { 'Legacy or unsupported' }",
    ]);
    checks.push({
      id: "secureboot",
      name: "Secure Boot",
      status: /true/i.test(sb) ? "ok" : "info",
      detail: /true/i.test(sb) ? "Secure Boot enabled" : "Secure Boot unavailable, disabled or legacy BIOS",
    });
    const ci = await run("powershell", [
      "-NoProfile", "-NonInteractive", "-Command",
      "Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\\Microsoft\\Windows\\DeviceGuard -ErrorAction SilentlyContinue | Select-Object -ExpandProperty SecurityServicesRunning",
    ]);
    checks.push({
      id: "codeintegrity",
      name: "Memory integrity (HVCI)",
      status: ci.trim() === "2" ? "ok" : "warn",
      detail: ci.trim() === "2" ? "Hypervisor-protected code integrity running" : "Memory integrity not active — kernel drivers load unchecked",
    });
  } else {
    const lsmod = await run("bash", ["-lc", "lsmod 2>/dev/null | grep -Ei 'vboxdrv|vhba|ndiswrapper' || true"]);
    checks.push({
      id: "kernelmods",
      name: "Kernel modules",
      status: lsmod.trim() ? "warn" : "ok",
      detail: lsmod.trim() ? `Unusual modules: ${lsmod.trim().split("\n").join(", ").slice(0, 120)}` : "No unusual out-of-tree kernel modules",
    });
  }

  // 3. Debugger / test-signing flags on Windows.
  if (isWin) {
    const dbg = await run("reg", [
      "query", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Image File Execution Options",
      "/s", "/f", "Debugger", "/d",
    ]);
    const dbgHits = dbg.split(/HKEY_LOCAL_MACHINE/i).length - 1;
    checks.push({
      id: "ifeo",
      name: "IFEO debuggers",
      status: dbgHits > 0 ? "warn" : "ok",
      detail: dbgHits > 0 ? `${dbgHits} Image File Execution Options entries attach debuggers` : "No IFEO debugger hooks",
    });
    const ts = await run("bcdedit", ["/enum", "{current}"]);
    const testOn = /testsigning\s+yes/i.test(ts);
    checks.push({
      id: "testsigning",
      name: "Test signing mode",
      status: testOn ? "fail" : "ok",
      detail: testOn ? "TESTSIGNING IS ON — unsigned kernel drivers load freely" : "Test signing disabled",
    });
  } else {
    const yama = await run("bash", ["-lc", "cat /proc/sys/kernel/yama/ptrace_scope 2>/dev/null || echo unknown"]);
    checks.push({
      id: "ptrace",
      name: "ptrace_scope (Yama)",
      status: yama.trim() === "0" ? "warn" : "ok",
      detail: `ptrace_scope = ${yama.trim()} (0 allows arbitrary process memory access)`,
    });
  }

  // 4. Temp-executables signal.
  const tmpExe = isWin ? path.join(os.tmpdir()) : "/tmp";
  let tmpCount = 0;
  try {
    for (const f of await fs.promises.readdir(tmpExe)) {
      if (/\.exe$|\.dll$|^\.x[0-9a-z]+$/i.test(f)) tmpCount++;
      if (tmpCount > 10) break;
    }
  } catch {
    /* ignore */
  }
  checks.push({
    id: "tempexec",
    name: "Executables in temp",
    status: tmpCount > 3 ? "warn" : "ok",
    detail: tmpCount > 3 ? `${tmpCount} executable-like files in temp directory` : "Temp directory looks clean",
  });

  // 5. Clock / timezone sanity (anti-timeshift for logs).
  checks.push({
    id: "clock",
    name: "System clock",
    status: "info",
    detail: `${new Date().toString()} — verify it matches the tournament timeframe`,
  });

  return { generatedAt: new Date().toISOString(), durationMs: Date.now() - started, items: checks };
}

function knownArtifact(name: string): boolean {
  const base = name.replace(/\.lnk$/i, "");
  const tokens = [...base.matchAll(/(?:^|[\\/\s"'])(([\w.-]+)\.exe)(?=$|[\s"'])/gi)].map((m) => m[1]);
  return Boolean(matchProcess(base) || matchPath(base) || tokens.some((t) => matchProcess(t)));
}

export function traceHistorySignals(activity: import("../shared/types").ActivityEntry[], bam: string[], prefetch: string[] | null, prefetchEnabled: boolean): OtherCheck[] {
  const launched = [...new Set([...activity.filter((a) => /^(Prefetch|History)/.test(a.category) && knownArtifact(a.name)).map((a) => `${a.name} · ${a.category} · ${a.time}`), ...bam.filter((p) => knownArtifact(path.basename(p))).map((p) => `${p} · BAM/DAM`)])];
  const deleted = activity.filter((a) => /^(RecycleBin|Trash)$/.test(a.category) && knownArtifact(a.name)).map((a) => `${a.name} · ${a.path} · ${a.time}`);
  const pfNames = new Set((prefetch ?? []).map((f) => f.replace(/-[A-F0-9]+\.pf$/i, "").toLowerCase()));
  const missing = prefetch && prefetchEnabled ? bam.filter((p) => knownArtifact(path.basename(p)) && !pfNames.has(path.basename(p).toLowerCase())) : [];
  return [
    { id: "knownlaunches", name: "Known signatures in launch history", status: launched.length ? "fail" : "ok", detail: launched.length ? `${launched.length} retained launch records match known filenames. A filename match needs manual verification; the file may no longer exist.` : "No matching filenames in readable launch records; unavailable history cannot be excluded.", evidence: launched },
    { id: "knowntrash", name: "Known signatures in deleted files", status: deleted.length ? "fail" : "ok", detail: deleted.length ? `${deleted.length} retained recycle/trash records match known filenames. Inspect metadata manually; nothing is restored automatically.` : "No matching filenames in readable recycle/trash records.", evidence: deleted },
    ...(isWin ? [{ id: "cachegaps", name: "Launch records without Prefetch", status: missing.length ? "warn" as const : prefetch === null || !prefetchEnabled ? "info" as const : "ok" as const, detail: missing.length ? `${missing.length} known filenames have BAM/DAM records but no corresponding Prefetch file. Cache eviction, settings and Windows behavior can explain this; not proof of cleaning.` : prefetch === null || !prefetchEnabled ? "Prefetch unavailable or disabled; no cache-gap conclusion is possible." : "No cache gaps for matching known launch filenames.", evidence: missing }] : []),
  ];
}

export async function collectTraces(): Promise<TabResult<OtherCheck>> {
  const started = Date.now();
  const checks: OtherCheck[] = [];
  const activity = await collectActivity();
  if (activity.error) checks.push({ id: "historyaccess", name: "History access", status: "info", detail: activity.error });
  if (isWin) {
    const ps = await run("powershell", ["-NoProfile", "-NonInteractive", "-Command", [
      "$r=@{}",
      "try { $r.eventlog=(Get-Service EventLog -ErrorAction Stop).Status.ToString() } catch { $r.eventlog='unknown' }",
      "try { $r.cleared=@(Get-WinEvent -FilterHashtable @{LogName='System';Id=104;StartTime=(Get-Date).AddDays(-7)} -ErrorAction Stop | Select-Object -First 30 | ForEach-Object { $_.TimeCreated.ToUniversalTime().ToString('o') + ' | ' + $_.Message }); $r.clearReadable=$true } catch { $r.cleared=@(); $r.clearReadable=$_.Exception.Message -match 'No events' }",
      "try { $p=Get-MpPreference -ErrorAction Stop; $r.defenderReadable=$true; $r.exclusions=@($p.ExclusionPath)+@($p.ExclusionProcess)+@($p.ExclusionExtension) | Where-Object { $_ } } catch { $r.defenderReadable=$false; $r.exclusions=@() }",
      "try { $r.prefetchEnabled=(Get-ItemProperty 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Memory Management\\PrefetchParameters' -Name EnablePrefetcher -ErrorAction Stop).EnablePrefetcher -in @(1,3) } catch { $r.prefetchEnabled=$false }",
      "$r | ConvertTo-Json -Depth 4 -Compress",
    ].join("; ")], 25000);
    let data: { eventlog?: string; cleared?: string[]; clearReadable?: boolean; defenderReadable?: boolean; exclusions?: string[]; prefetchEnabled?: boolean } = {};
    try { data = JSON.parse(ps); } catch { /* Unavailable system checks remain unknown. */ }
    const [bamRaw, damRaw, usn] = await Promise.all([
      run("reg", ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\bam\\State\\UserSettings", "/s"]),
      run("reg", ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Services\\dam\\State\\UserSettings", "/s"]),
      run("powershell", ["-NoProfile", "-NonInteractive", "-Command", "& fsutil usn queryjournal $env:SystemDrive 2>$null; if ($LASTEXITCODE -eq 0) { 'MYTHIC_USN_OK' }"]),
    ]);
    const bam = [...new Set([...`${bamRaw}\n${damRaw}`.matchAll(/^\s*(.+?\.exe)\s+REG_BINARY\s+/gim)].map((m) => m[1].trim()))];
    const prefetch = await fs.promises.readdir(path.join(winDir, "Prefetch")).catch(() => null);
    checks.push(...traceHistorySignals(activity.items, bam, prefetch, Boolean(data.prefetchEnabled)));
    const exclusions = data.exclusions ?? [];
    checks.push({ id: "defenderexclusions", name: "Windows Defender exclusions", status: exclusions.length ? "warn" : data.defenderReadable ? "ok" : "info", detail: exclusions.length ? `${exclusions.length} configured exclusions. Legitimate software may add exclusions; verify each path manually. This check is read-only.` : data.defenderReadable ? "No configured path/process/extension exclusions reported." : "Defender preferences unavailable: permissions, policy or another antivirus. Not evidence of a clean configuration.", evidence: exclusions });
    checks.push({ id: "evlog", name: "Event Log service", status: data.eventlog === "Running" ? "ok" : data.eventlog && data.eventlog !== "unknown" ? "warn" : "info", detail: data.eventlog === "Running" ? "Windows Event Log service running." : `Service status: ${data.eventlog ?? "unavailable"}; verify permissions and configuration.` });
    checks.push({ id: "logclears", name: "Recent event-log clearing", status: data.cleared?.length ? "warn" : data.clearReadable ? "ok" : "info", detail: data.cleared?.length ? `${data.cleared.length} event-log clearing records in the last 7 days. Maintenance can explain this.` : data.clearReadable ? "No event 104 found in readable System log for the last 7 days." : "Clearing records unavailable or no readable retained events; cannot conclude no clearing occurred.", evidence: data.cleared ?? [] });
    checks.push({ id: "usn", name: "USN Journal", status: usn.includes("MYTHIC_USN_OK") ? "ok" : "info", detail: usn.includes("MYTHIC_USN_OK") ? "USN journal query succeeded on the system drive." : "Journal query failed: administrator permissions, non-NTFS drive or no journal. A failed query alone is not proof of deletion." });
    const cleaners = (prefetch ?? []).filter((f) => /(bleachbit|ccleaner|privazer|sdelete|eraser|wisecleaner)/i.test(f));
    checks.push({ id: "cleaners", name: "Cleaner execution records", status: cleaners.length ? "warn" : prefetch ? "ok" : "info", detail: cleaners.length ? "Cleaner-named Prefetch records found. Execution does not establish which files were cleaned." : prefetch ? "No cleaner-named files in readable Prefetch." : "Prefetch is not readable; cleaner history is unknown.", evidence: cleaners });
  } else {
    checks.push(...traceHistorySignals(activity.items, [], null, false));
    const histories = [path.join(os.homedir(), ".bash_history"), path.join(os.homedir(), ".zsh_history"), path.join(os.homedir(), ".local", "share", "fish", "fish_history")];
    const wipeCommands: string[] = [];
    let readable = 0;
    for (const file of histories) {
      try {
        const st = await fs.promises.stat(file);
        if (st.size > 8 * 1024 * 1024) continue;
        const text = await fs.promises.readFile(file, "utf-8");
        readable++;
        for (const line of text.split(/\r?\n/).slice(-2000)) {
          if (/\bhistory\s+-c\b|\b(?:shred|bleachbit)\b|\bjournalctl\s+--vacuum|(?:^|[; ])(?:rm|truncate)\s+.*(?:bash_history|zsh_history)/i.test(line)) wipeCommands.push(`${file} · ${line.trim().slice(0, 500)}`);
        }
      } catch { /* Only readable retained user history is inspected. */ }
    }
    checks.push({ id: "histwipe", name: "Cleanup commands in shell history", status: wipeCommands.length ? "warn" : readable ? "ok" : "info", detail: wipeCommands.length ? "Retained cleanup commands require manual review; legitimate maintenance is possible." : readable ? "No matching cleanup commands in the last 2000 lines of readable histories. Missing/empty history is not proof of wiping." : "No readable retained shell history; history checks unavailable.", evidence: wipeCommands });
    const journal = await new Promise<{ ok: boolean; text: string }>((resolve) => {
      execFile("journalctl", ["--verify"], { timeout: 20000, maxBuffer: 4 * 1024 * 1024, encoding: "utf-8" }, (err, stdout, stderr) => resolve({ ok: !err, text: `${stdout}\n${stderr}` }));
    });
    const verified = journal.ok && /PASS:/i.test(journal.text);
    const damaged = /FAIL:|corrupt/i.test(journal.text);
    checks.push({ id: "journal", name: "Accessible systemd journal integrity", status: damaged ? "warn" : verified ? "ok" : "info", detail: damaged ? "Journal verification reported failures. Storage faults can explain them; manual review required." : verified ? "Accessible journal files passed verification; this cannot prove logs were never deleted." : "No verifiable journal files or journalctl unavailable. This distro/session may not use systemd.", evidence: journal.text.trim().split(/\r?\n/).filter(Boolean).slice(-30) });
  }
  const rank = { fail: 0, warn: 1, info: 2, ok: 3 };
  checks.sort((a, b) => rank[a.status] - rank[b.status]);
  return { generatedAt: new Date().toISOString(), durationMs: Date.now() - started, items: checks };
}
