import { FolderOpen, HardDrive, Search, X, Zap } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DriveInfo, ScanMatch, ScanProgress, TabId } from "@shared/types";
import { api } from "../api";
import { FilterBar, SelectFoldersButton, StopButton, TabHeader } from "../components/TabHeader";
import { EmptyState, RiskBadge, fmtSize, fmtTime, fmtDuration } from "../components/ui";
import type { Dict } from "../i18n";

type ScanStep = "menu" | "drives";

function ScanModeModal({
  t,
  onClose,
  onStart,
}: {
  t: Dict;
  onClose: () => void;
  onStart: (folders: string[]) => void;
}) {
  const [step, setStep] = useState<ScanStep>("menu");
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [modeError, setModeError] = useState("");
  const [choosing, setChoosing] = useState(false);

  const modes = [
    { id: "quick", icon: Zap, label: t.scanModes.quick, desc: t.scanModes.quickDesc, run: () => onStart([]) },
    { id: "system", icon: HardDrive, label: t.scanModes.system, desc: t.scanModes.systemDesc, run: async () => {
      const drive = (await api().listDrives()).find(d => d.system);
      if (!drive) throw Error(t.actionFailed);
      onStart([drive.root]);
    } },
    {
      id: "manual", icon: FolderOpen, label: t.scanModes.manual, desc: t.scanModes.manualDesc,
      run: async () => {
        setDrives(await api().listDrives());
        setStep("drives");
      },
    },
    {
      id: "folder", icon: Search, label: t.scanModes.folder, desc: t.scanModes.folderDesc,
      run: async () => {
        const sel = await api().selectFolders();
        if (sel.length) onStart(sel);
      },
    },
  ];

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-[560px] max-w-[92vw] rounded-xl border border-edge bg-panel p-5 shadow-card animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[14px] font-bold text-white">{t.scanModes.title}</div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-edge hover:text-white">
            <X size={15} />
          </button>
        </div>

        {modeError && <p role="alert" className="mb-3 text-[12px] text-red-300">{modeError}</p>}
        {step === "menu" ? (
          <div className="grid grid-cols-2 gap-2.5">
            {modes.map((m) => (
              <button
                key={m.id}
                disabled={choosing}
                onClick={async () => {
                  setChoosing(true);
                  setModeError("");
                  try { await m.run(); } catch { setModeError(t.actionFailed); }
                  finally { setChoosing(false); }
                }}
                className="group rounded-lg border border-edge bg-base p-4 text-left transition-all hover:border-accent/50 hover:shadow-accent-glow"
              >
                <m.icon size={18} className="text-muted transition-colors group-hover:text-red-400" />
                <div className="mt-2.5 text-[13px] font-bold text-white">{m.label}</div>
                <div className="mt-1 text-[10.5px] leading-relaxed text-faint">{m.desc}</div>
              </button>
            ))}
          </div>
        ) : (
          <div>
            <div className="space-y-1.5">
              {drives.map((d) => (
                <button
                  key={d.root}
                  onClick={() => onStart([d.root])}
                  className="flex w-full items-center justify-between rounded-md border border-edge bg-base px-4 py-3 text-left transition-colors hover:border-accent/50"
                >
                  <span className="flex items-center gap-2.5 font-mono text-[13px] font-semibold text-white">
                    <HardDrive size={15} className="text-muted" />
                    {d.root}
                    <span className="font-sans text-[10.5px] font-normal text-faint">{d.label}</span>
                  </span>
                  {d.freeGb !== undefined && d.totalGb !== undefined && (
                    <span className="font-mono text-[10.5px] text-faint">
                      {d.freeGb} {t.drives.free} / {d.totalGb} GB
                    </span>
                  )}
                </button>
              ))}
              {drives.length === 0 && <div className="py-6 text-center text-[12px] text-faint">—</div>}
            </div>
            <button
              onClick={() => setStep("menu")}
              className="mt-3 text-[11.5px] font-semibold text-muted transition-colors hover:text-white"
            >
              ← {t.scanModes.cancel}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FileSearchTab({ t }: { t: Dict }) {
  const tab: TabId = "file-search";
  const [folders, setFolders] = useState<string[]>([]);
  const [showModes, setShowModes] = useState(false);
  const [matches, setMatches] = useState<ScanMatch[]>([]);
  const [progress, setProgress] = useState<ScanProgress>({
    status: "idle",
    currentPath: "",
    scannedFiles: 0,
    found: 0,
    startedAt: null,
  });
  const [filter, setFilter] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const startedRef = useRef<number | null>(null);
  const stateRef = useRef(progress);
  stateRef.current = progress;

  useEffect(() => {
    const un1 = api().onScanProgress((p) => {
      setProgress((prev) => ({ ...prev, ...p }));
      if (p.status === "running" && p.startedAt) startedRef.current = p.startedAt;
    });
    const un2 = api().onScanResult((m) => setMatches((prev) => [...prev, m]));
    const un3 = api().onScanDone((r) => {
      setMatches(r.matches);
      setElapsed(r.durationMs);
      setProgress((prev) => ({ ...prev, status: "done", scannedFiles: r.scanned, found: r.matches.length }));
    });
    return () => {
      un1();
      un2();
      un3();
    };
  }, []);

  useEffect(() => {
    if (progress.status !== "running") return;
    const iv = setInterval(() => {
      if (startedRef.current) setElapsed(Date.now() - startedRef.current);
    }, 500);
    return () => clearInterval(iv);
  }, [progress.status]);

  const running = progress.status === "running";

  const beginScan = async (scanFolders: string[]) => {
    setFolders(scanFolders);
    setShowModes(false);
    setMatches([]);
    setElapsed(0);
    const startedAt = Date.now();
    startedRef.current = startedAt;
    setProgress({ status: "running", currentPath: "", scannedFiles: 0, found: 0, startedAt });
    try { await api().startScan(scanFolders); }
    catch (e) { setProgress(prev => ({ ...prev, status: "error", currentPath: e instanceof Error ? e.message : t.actionFailed })); }
  };

  const filtered = useMemo(() => {
    const q = filter.toLowerCase().trim();
    if (!q) return matches;
    return matches.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.cheat.toLowerCase().includes(q) ||
        m.path.toLowerCase().includes(q),
    );
  }, [matches, filter]);

  const stage = progress.status;
  const title =
    stage === "running" ? t.status.runningTitle : stage === "done" ? t.status.doneTitle : stage === "error" ? t.status.errorTitle : t.status.idleTitle;

  return (
    <div className="space-y-4 animate-fade-up">
      <TabHeader
        tab={tab}
        t={t}
        actions={
          <>
            {running ? (
              <StopButton t={t} onClick={() => void api().stopScan().catch(() => setProgress(prev => ({ ...prev, status: "error", currentPath: t.actionFailed })))} />
            ) : (
              <>
                <SelectFoldersButton
                  t={t}
                  onClick={async () => {
                    try {
                      const sel = await api().selectFolders();
                      if (sel.length) void beginScan(sel);
                    } catch { setProgress(prev => ({ ...prev, status: "error", currentPath: t.actionFailed })); }
                  }}
                />
                <button
                  onClick={() => setShowModes(true)}
                  className="flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-[12px] font-bold text-white shadow-accent-glow transition-all hover:bg-red-700"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" />
                    <path d="m21 21-4.3-4.3" />
                  </svg>
                  {t.startSearch}
                </button>
              </>
            )}
          </>
        }
      />

      {showModes && <ScanModeModal t={t} onClose={() => setShowModes(false)} onStart={beginScan} />}

      {/* Status banner */}
      <div
        className={`flex items-center justify-between rounded-lg border bg-panel p-4 shadow-card ${
          running ? "border-accent/40" : stage === "error" ? "border-accent/60" : "border-edge"
        }`}
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <div
            className={`grid h-11 w-11 shrink-0 place-items-center rounded-md border ${
              running ? "border-accent/50 bg-accent/10 text-red-400" : "border-edge bg-base text-amber-400"
            }`}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
              <path d="M12 9v4" />
              <path d="M12 17h.01" />
            </svg>
          </div>
          <div className="min-w-0">
            <div className="text-[13.5px] font-bold text-white">{title}</div>
            <div className="mt-0.5 truncate font-mono text-[10.5px] text-muted">
              {running
                ? progress.currentPath || t.scanning
                : stage === "done"
                  ? `${t.scannedFiles}: ${progress.scannedFiles.toLocaleString()} · ${t.duration}: ${fmtDuration(elapsed)}`
                  : stage === "error" ? progress.currentPath : t.status.idleDesc}
            </div>
            {running && (
              <div className="relative mt-2 h-1 w-[420px] max-w-full overflow-hidden rounded bg-edge">
                <div className="absolute inset-y-0 w-1/3 animate-scan-slide rounded bg-gradient-to-r from-transparent via-accent to-transparent" />
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div
            className={`font-mono text-[26px] font-bold leading-none ${
              matches.length > 0 ? "text-red-400 drop-shadow-[0_0_10px_rgba(220,38,38,0.5)]" : "text-faint"
            }`}
          >
            {stage === "idle" ? "—" : matches.length}
          </div>
          <div className="mt-1 text-[10px] font-bold tracking-[0.2em] text-faint">{t.matches}</div>
        </div>
      </div>

      <FilterBar
        value={filter}
        onChange={setFilter}
        t={t}
        right={
          <>
            <span className="font-mono text-[15px] font-semibold text-muted">{fmtDuration(elapsed)}</span>
            <span className="text-[11px] text-faint">
              {t.found}: <span className={filtered.length > 0 ? "font-bold text-red-400" : "font-bold text-muted"}>{filtered.length}</span>
            </span>
          </>
        }
      />

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-edge bg-panel shadow-card">
        <div className="overflow-auto" style={{ maxHeight: "calc(100vh - 335px)" }}>
          <table className="w-full min-w-[980px] border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-panel">
              <tr className="border-b border-edge text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
                <th className="px-4 py-2.5">{t.table.name}</th>
                <th className="px-4 py-2.5">{t.table.cheat}</th>
                <th className="px-4 py-2.5">{t.table.type}</th>
                <th className="px-4 py-2.5">{t.table.size}</th>
                <th className="px-4 py-2.5">{t.table.modified}</th>
                <th className="px-4 py-2.5">{t.table.path}</th>
                <th className="px-4 py-2.5">{t.table.risk}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-edge/50 text-[12px] transition-colors last:border-0 hover:bg-edge/30">
                  <td className="max-w-[180px] truncate px-4 py-2.5 font-semibold text-white">{m.name}</td>
                  <td className="px-4 py-2.5 text-red-400/90">{m.cheat}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{m.type}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{fmtSize(m.size)}</td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted">{fmtTime(m.modified)}</td>
                  <td className="max-w-[280px] px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-mono text-[10.5px] text-faint" title={m.path}>
                        {m.path}
                      </span>
                      <button
                        title={m.path}
                        onClick={() => api().openInExplorer(m.path)}
                        className="shrink-0 text-faint transition-colors hover:text-white"
                      >
                        <FolderOpen size={13} />
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <RiskBadge risk={m.risk} t={t} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 && <EmptyState title={t.empty["file-search"].title} desc={t.empty["file-search"].desc} />}
        </div>
      </div>
    </div>
  );
}
