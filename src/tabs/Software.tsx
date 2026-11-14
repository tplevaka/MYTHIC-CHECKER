import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, Clock, Download, File, Folder, Globe, Loader2, Monitor, RefreshCw, Search, Server, User } from "lucide-react";
import type { ActivityEntry, TabId, UtilityEntry } from "@shared/types";
import { fmtTime } from "../components/ui";
import { api } from "../api";
import { TabHeader } from "../components/TabHeader";
import type { Dict } from "../i18n";
import { useTabData } from "./Generic";

const icons = [Search, Folder, File, User, Server, Clock, Activity, Folder, Globe, Download, Monitor, Server];

export default function SoftwareTab({ t, setTab }: { t: Dict; setTab: (tab: TabId) => void }) {
  const { data, running, run, error } = useTabData<UtilityEntry>(() => api().getUtilities(), true);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [showRecent, setShowRecent] = useState(false);
  const [recent, setRecent] = useState<ActivityEntry[]>([]);
  useEffect(() => {
    if (!showRecent) return;
    const close = (e: KeyboardEvent) => { if (e.key === "Escape") setShowRecent(false); };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [showRecent]);

  const launch = async (id: string) => {
    setBusy(id);
    setMessage("");
    try {
      const result = await api().runUtility(id);
      if (!result.ok) setMessage(t.toolState.failed);
      else if (result.action === "internal") {
        if (id === "systeminformer") setTab("processes");
        else if (id === "recentfiles") {
          const records = await api().getRecentFiles();
          setRecent(records.items);
          setMessage(records.error ?? "");
          setShowRecent(true);
        }
      }
    } catch {
      setMessage(t.toolState.failed);
    } finally {
      setBusy(null);
    }
  };

  const group = (key: UtilityEntry["group"]) => {
    const entries = (data ?? []).filter((u) => u.group === key);
    return (
      <section key={key}>
        <div className="mb-2.5 flex items-center gap-3 text-[10px] font-medium tracking-wider text-faint">
          <span>{t.softwareGroups[key]}</span><span className="h-px flex-1 bg-edge" />
          <span className="font-mono">{entries.length}</span>
        </div>
        <div className="space-y-2">
          {entries.map((u) => {
            const index = data!.indexOf(u);
            const Icon = icons[index] ?? File;
            const [name, description] = api().platform === "linux" && u.id === "systeminformer" ? [t.linuxProcessMonitor, t.linuxProcessHint] : t.tools[u.id] ?? [u.name, u.description];
            return (
              <button key={u.id} disabled={busy !== null || (api().platform === "linux" && !u.builtin && !u.installed)} onClick={() => void launch(u.id)}
                title={u.installed ? u.path : u.builtin ? t.toolState.builtin : t.software.download}
                className="group flex min-h-[64px] w-full items-center gap-3 rounded-lg border border-edge bg-panel px-4 py-2.5 text-left transition-colors hover:border-accent/40 hover:bg-edge/30 disabled:opacity-60">
                <span className="font-mono text-[10px] text-faint">{String(index + 1).padStart(2, "0")}</span>
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-edge bg-base text-muted group-hover:text-red-400">
                  {busy === u.id ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-white">{name}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-faint">{description}</span>
                </span>
                <span className={`text-[9px] ${u.installed ? "text-emerald-400" : "text-faint"}`}>
                  {api().platform === "linux" && !u.builtin && !u.installed ? t.windowsOnly : u.installed ? t.toolState.installed : u.builtin ? t.toolState.builtin : t.toolState.download}
                </span>
                <ArrowUpRight size={13} className="shrink-0 text-faint group-hover:text-red-400" />
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  return (
    <div className="space-y-5 animate-fade-up">
      <TabHeader tab="software" t={t} actions={
        <button disabled={running} onClick={() => void run()} className="flex h-9 items-center gap-2 rounded-md border border-edge bg-panel px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-edge disabled:opacity-50">
          {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} {t.runCheck}
        </button>
      } />
      {(error || message) && <p role="alert" className="text-[12px] text-red-300">{error || message}</p>}
      {data === null ? <div className="h-64 animate-pulse rounded-lg border border-edge bg-panel" /> : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {group("files")}
          <div className="space-y-8">{group("browser")}{group("game")}{group("registry")}</div>
        </div>
      )}
      <p className="text-[10px] text-faint">{t.compatibility}</p>
      {api().platform === "linux" && <p className="text-[11px] text-faint">{t.linuxUtilitiesHint}</p>}
      {showRecent && <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-6" onClick={(e) => { if (e.target === e.currentTarget) setShowRecent(false); }}>
        <section role="dialog" aria-label={t.tools.recentfiles[0]} className="max-h-[80vh] w-full max-w-4xl overflow-auto rounded-lg border border-edge bg-panel p-5">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-bold text-white">{t.tools.recentfiles[0]} · {recent.length}</h2><button onClick={() => setShowRecent(false)} className="rounded border border-edge px-3 py-1 text-[12px] text-muted">{t.panels.close}</button></div>
          {message && <p role="alert" className="mb-3 text-[12px] text-amber-400">{message}</p>}
          {!recent.length && <p className="text-[12px] text-faint">{t.empty.generic.title}</p>}
          {recent.map((r) => <div key={r.id} className="border-b border-edge py-3 text-[12px]"><div className="flex justify-between gap-3"><span className="font-semibold text-white">{r.name}</span><span className="text-faint">{fmtTime(r.time)}</span></div><div className="mt-1 break-all font-mono text-[10px] text-muted">{r.path}</div><button className="mt-2 text-red-400" onClick={() => api().openInExplorer(r.path)}>{t.openFolder}</button></div>)}
        </section>
      </div>}
    </div>
  );
}
