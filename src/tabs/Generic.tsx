import { useEffect, useMemo, useState } from "react";
import type { TabId, TabResult } from "@shared/types";
import { api } from "../api";
import { FilterBar, RunButton, TabHeader } from "../components/TabHeader";
import { EmptyState, RiskBadge, StatusBanner, Toggle, TypeDropdown, fmtSize, fmtTime } from "../components/ui";
import type { Dict } from "../i18n";

interface Column<T> {
  key: string;
  label: string;
  mono?: boolean;
  truncate?: boolean;
  render: (row: T) => React.ReactNode;
}

export function useTabData<T>(fetcher: () => Promise<TabResult<T>>, auto: boolean) {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState("");
  const [running, setRunning] = useState(false);
  const [generatedAt, setGeneratedAt] = useState("");
  const [lastDuration, setLastDuration] = useState(0);

  const run = async () => {
    setRunning(true);
    setError("");
    const started = Date.now();
    try {
      const r = await fetcher();
      setData(r.items);
      setGeneratedAt(r.generatedAt);
      setLastDuration(r.durationMs);
      if (r.error) setError(r.error);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setLastDuration(Date.now() - started);
    }
  };

  useEffect(() => {
    if (auto) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto]);

  return { data, error, running, run, generatedAt, lastDuration };
}

function GenericTable<T extends { id: string }>({
  columns,
  rows,
  t,
  emptyKey = "generic",
}: {
  columns: Column<T>[];
  rows: T[] | null;
  t: Dict;
  emptyKey?: string;
}) {
  if (rows === null) {
    return (
      <div className="overflow-hidden rounded-lg border border-edge bg-panel shadow-card">
        <EmptyState title={t.empty[emptyKey].title} desc={t.empty[emptyKey].desc} />
      </div>
    );
  }
  return (
    <div className="overflow-hidden rounded-lg border border-edge bg-panel shadow-card">
      <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
        <table className="w-full min-w-[900px] border-collapse text-left">
          <thead className="sticky top-0 z-10 bg-panel">
            <tr className="border-b border-edge text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
              {columns.map((c) => (
                <th key={c.key} className="px-4 py-2.5">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-edge/50 text-[12px] transition-colors last:border-0 hover:bg-edge/30">
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 py-2.5 ${c.truncate ? "max-w-[260px] truncate" : ""}`}>
                    <span className={c.mono ? "font-mono text-[11px] text-muted" : ""}>{c.render(r)}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <EmptyState title={t.empty[emptyKey].title} desc={t.empty[emptyKey].desc} />}
      </div>
    </div>
  );
}

interface ShellProps<T extends { id: string }> {
  tab: TabId;
  t: Dict;
  fetcher: () => Promise<TabResult<T>>;
  auto?: boolean;
  columns: Column<T>[];
  filterFn: (row: T, q: string) => boolean;
  after?: React.ReactNode;
  toolbar?: React.ReactNode;
  signal?: (row: T) => boolean;
}

export function TabShell<T extends { id: string }>({ tab, t, fetcher, auto, columns, filterFn, after, toolbar, signal }: ShellProps<T>) {
  const { data, error, running, run, generatedAt, lastDuration } = useTabData(fetcher, auto ?? true);
  const [filter, setFilter] = useState("");

  const rows = useMemo(() => {
    if (data === null) return null;
    const q = filter.toLowerCase().trim();
    return data.filter((r) => filterFn(r, q));
  }, [data, filter, filterFn]);

  return (
    <div className="space-y-4 animate-fade-up">
      <TabHeader
        tab={tab}
        t={t}
        actions={
          <>
            {generatedAt && (
              <span className="font-mono text-[10.5px] text-faint">
                {fmtTime(generatedAt)} · {lastDuration} ms
              </span>
            )}
            <RunButton t={t} running={running} label={t.runCheck} onClick={() => void run()} />
          </>
        }
      />
      {error && (
        <div className="rounded-lg border border-accent/40 bg-accent/10 px-4 py-2.5 text-[12px] text-red-300">
          {error}
        </div>
      )}
      <FilterBar
        value={filter}
        onChange={setFilter}
        t={t}
        right={
          <>
          {toolbar}
          <span className="text-[11px] text-faint">
            {t.found}: <span className={rows && rows.length > 0 ? "font-bold text-red-400" : "font-bold text-muted"}>{rows?.length ?? 0}</span>
          </span>
          </>
        }
      />
      {signal && <StatusBanner state={running ? "running" : error ? "error" : data ? "done" : "idle"} found={data?.filter(signal).length ?? 0} t={t} />}
      <GenericTable columns={columns} rows={rows} t={t} />
      {after}
    </div>
  );
}

/* ---------------- concrete tabs ---------------- */

import type {
  ActivityEntry,
  OtherCheck,
  ProcessEntry,
  RegistryEntry,
  RenamedEntry,
  UsbDevice,
} from "@shared/types";

const contains = (q: string, ...vals: (string | number | undefined)[]) =>
  !q || vals.some((v) => v !== undefined && String(v).toLowerCase().includes(q));

export function UsbTab({ t }: { t: Dict }) {
  return (
    <TabShell<UsbDevice>
      tab="usb-devices"
      t={t}
      fetcher={() => api().getUsbDevices()}
      columns={[
        { key: "name", label: t.table.name, truncate: true, render: (r) => <span className="font-semibold text-white">{r.name}</span> },
        { key: "id", label: t.table.deviceId, mono: true, render: (r) => r.deviceId },
        { key: "src", label: t.table.source, mono: true, render: (r) => r.source },
      ]}
      filterFn={(r, q) => contains(q, r.name, r.deviceId, r.source)}
    />
  );
}

type ActivityType = "exe" | "rar" | "zip" | "ahk" | "cs2" | "browser";

const SYSTEM_PATH_RE = /(^|[\\/])(windows|program files( \(x86\))?|programdata)([\\/]|$)/i;

function activityTypes(r: ActivityEntry): ActivityType[] {
  const n = r.name.toLowerCase().replace(/\.lnk$/, "");
  const types: ActivityType[] = [];
  if (/\.exe\b/.test(n) || r.category === "Prefetch") types.push("exe");
  if (/\.rar\b/.test(n)) types.push("rar");
  if (/\.(zip|7z)\b/.test(n)) types.push("zip");
  if (/\.ahk\b/.test(n)) types.push("ahk");
  if (n.includes("cs2")) types.push("cs2");
  if (r.category.toLowerCase().startsWith("browser")) types.push("browser");
  return types;
}

async function fetchActivity(): Promise<TabResult<ActivityEntry>> {
  const [act, sites] = await Promise.all([api().getLastActivity(), api().getSites()]);
  const browserItems: ActivityEntry[] = sites.items.map((s) => ({
    id: `br-${s.id}`,
    name: s.domain,
    category: `Browser · ${s.browser}`,
    time: "—",
    path: s.profile,
    risk: s.risk,
  }));
  return {
    generatedAt: act.generatedAt,
    durationMs: act.durationMs + sites.durationMs,
    items: [...act.items, ...browserItems],
    error: act.error,
  };
}

export function ActivityTab({ t }: { t: Dict }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(["exe", "rar", "zip", "ahk", "cs2", "browser"]));
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [hideSystem, setHideSystem] = useState(false);

  const toggleType = (v: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  const typeOptions = [
    { value: "exe", label: t.activityFilters.exe },
    { value: "rar", label: t.activityFilters.rar },
    { value: "zip", label: t.activityFilters.zip },
    { value: "ahk", label: t.activityFilters.ahk },
    { value: "cs2", label: t.activityFilters.cs2 },
    { value: "browser", label: t.activityFilters.browser },
  ];

  return (
    <TabShell<ActivityEntry>
      tab="last-activity"
      t={t}
      fetcher={fetchActivity}
      toolbar={
        <>
          <TypeDropdown options={typeOptions} selected={selected} onToggle={toggleType} allLabel={t.activityFilters.type} />
          <Toggle checked={suspiciousOnly} onChange={setSuspiciousOnly} label={t.activityFilters.suspicious} />
          <Toggle checked={hideSystem} onChange={setHideSystem} label={t.activityFilters.hideSystem} />
        </>
      }
      columns={[
        { key: "name", label: t.table.name, truncate: true, render: (r) => <span className="font-semibold text-white">{r.name}</span> },
        { key: "cat", label: t.table.category, render: (r) => <span className="text-muted">{r.category}</span> },
        { key: "time", label: t.table.time, mono: true, render: (r) => fmtTime(r.time) },
        { key: "path", label: t.table.path, mono: true, truncate: true, render: (r) => <span className="text-faint">{r.path}</span> },
        { key: "risk", label: t.table.risk, render: (r) => <RiskBadge risk={r.risk} t={t} /> },
      ]}
      filterFn={(r, q) => {
        if (suspiciousOnly && r.risk === "low") return false;
        if (hideSystem && SYSTEM_PATH_RE.test(r.path)) return false;
        if (selected.size === 0 || (selected.size < typeOptions.length && !activityTypes(r).some((x) => selected.has(x)))) return false;
        return contains(q, r.name, r.category, r.path);
      }}
    />
  );
}

export function RegistryTab({ t }: { t: Dict }) {
  const [suspiciousOnly, setSuspiciousOnly] = useState(false);
  const [launchesOnly, setLaunchesOnly] = useState(false);
  return (
    <TabShell<RegistryEntry>
      tab="pc-registry"
      t={t}
      fetcher={() => api().getRegistry()}
      toolbar={<>
        <Toggle checked={suspiciousOnly} onChange={setSuspiciousOnly} label={t.activityFilters.suspicious} />
        <Toggle checked={launchesOnly} onChange={setLaunchesOnly} label={t.filters.launches} />
      </>}
      columns={[
        { key: "src", label: t.table.source, render: (r) => <span className="badge border border-edge bg-base text-muted">{r.source}</span> },
        { key: "val", label: t.table.value, mono: true, truncate: true, render: (r) => <span className="text-white/90">{r.value}</span> },
        { key: "note", label: t.table.note, render: (r) => <span className="text-faint">{r.note}</span> },
        { key: "risk", label: t.table.risk, render: (r) => <RiskBadge risk={r.risk} t={t} /> },
      ]}
      filterFn={(r, q) => (!suspiciousOnly || r.risk !== "low") && (!launchesOnly || ["BAM", "DAM"].includes(r.source)) && contains(q, r.key, r.value, r.source, r.note)}
    />
  );
}

export function ProcessesTab({ t }: { t: Dict }) {
  return (
    <TabShell<ProcessEntry>
      tab="processes"
      t={t}
      fetcher={() => api().getProcesses()}
      signal={(r) => r.risk !== "low"}
      columns={[
        { key: "name", label: t.table.name, render: (r) => <span className="font-semibold text-white">{r.name}</span> },
        { key: "pid", label: t.table.pid, mono: true, render: (r) => r.pid },
        { key: "path", label: t.table.path, mono: true, truncate: true, render: (r) => r.path || "—" },
        { key: "note", label: t.table.note, render: (r) => <span className="text-faint">{r.note || "—"}</span> },
        { key: "mods", label: t.table.injected, truncate: true, render: (r) =>
          r.injectedModules.length ? (
            <span className="font-mono text-[11px] text-red-300">{r.injectedModules.join(", ")}</span>
          ) : (
            <span className="text-faint">—</span>
          ),
        },
        { key: "risk", label: t.table.risk, render: (r) => <RiskBadge risk={r.risk} t={t} /> },
      ]}
      filterFn={(r, q) => contains(q, r.name, r.path, r.injectedModules.join(" "))}
    />
  );
}

export function RenamedTab({ t }: { t: Dict }) {
  const [showSystem, setShowSystem] = useState(false);
  return (
    <TabShell<RenamedEntry>
      tab="renamed-files"
      t={t}
      fetcher={() => api().getRenamedFiles()}
      toolbar={<Toggle checked={showSystem} onChange={setShowSystem} label={t.filters.showSystem} />}
      columns={[
        { key: "name", label: t.table.name, truncate: true, render: (r) => <span className="font-semibold text-white">{r.name}</span> },
        { key: "orig", label: t.table.originalName, mono: true, truncate: true, render: (r) => <span className="text-red-400/90">{r.originalName ?? "—"}</span> },
        { key: "src", label: t.table.source, render: (r) => <span className="text-muted">{r.source ?? "—"}</span> },
        { key: "real", label: t.table.realType, mono: true, render: (r) => <span className="text-amber-400">{r.realType}</span> },
        { key: "ext", label: t.table.declaredExt, mono: true, render: (r) => r.declaredExt },
        { key: "path", label: t.table.path, mono: true, truncate: true, render: (r) => <span className="text-faint">{r.path}</span> },
        { key: "risk", label: t.table.risk, render: (r) => <RiskBadge risk={r.risk} t={t} /> },
      ]}
      filterFn={(r, q) => (showSystem || !SYSTEM_PATH_RE.test(r.path)) && contains(q, r.name, r.path, r.realType, r.originalName, r.source)}
    />
  );
}

const STATUS_ICON: Record<string, { color: string; glyph: string }> = {
  ok: { color: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10", glyph: "✓" },
  warn: { color: "text-amber-400 border-amber-500/40 bg-amber-500/10", glyph: "!" },
  fail: { color: "text-red-400 border-accent/50 bg-accent/10", glyph: "✕" },
  info: { color: "text-sky-400 border-sky-500/40 bg-sky-500/10", glyph: "i" },
};

export function ChecksTab({ t, tab }: { t: Dict; tab: "other" | "traces" }) {
  const fetcher = tab === "traces" ? () => api().getTraces() : () => api().getOtherChecks();
  return (
    <TabShell<OtherCheck>
      tab={tab}
      t={t}
      fetcher={fetcher}
      signal={(r) => r.status === "fail" || r.status === "warn"}
      columns={[
        { key: "st", label: t.table.status, render: (r) => {
          const s = STATUS_ICON[r.status];
          return (
            <span className={`inline-grid h-6 w-6 place-items-center rounded-md border text-[12px] font-bold ${s.color}`}>
              {s.glyph}
            </span>
          );
        } },
        { key: "name", label: t.table.name, render: (r) => <span className="font-semibold text-white">{r.name}</span> },
        { key: "detail", label: t.table.detail, truncate: true, render: (r) => <span className="text-muted">{r.detail}</span> },
      ]}
      filterFn={(r, q) => contains(q, r.name, r.detail, r.status)}
    />
  );
}
