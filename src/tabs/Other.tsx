import { useState } from "react";
import { Cpu, Keyboard, Loader2, Monitor, Mouse, RefreshCw, Settings } from "lucide-react";
import type { SystemInfo, TabId } from "@shared/types";
import { api } from "../api";
import { TabHeader } from "../components/TabHeader";
import { fmtTime } from "../components/ui";
import type { Dict } from "../i18n";
import { ChecksTab, useTabData } from "./Generic";

export default function OtherTab({ t, setTab }: { t: Dict; setTab: (tab: TabId) => void }) {
  const { data, running, run, error } = useTabData<SystemInfo>(async () => ({
    items: [await api().getSystemInfo()], generatedAt: new Date().toISOString(), durationMs: 0,
  }), true);
  const [actionError, setActionError] = useState("");
  const info = data?.[0];
  const launch = async (id: string) => {
    setActionError("");
    try {
      if (!(await api().runUtility(id)).ok) setActionError(t.toolState.failed);
    } catch {
      setActionError(t.toolState.failed);
    }
  };
  const button = (id: string, label: string, Icon = Settings) => (
    <button onClick={() => void launch(id)} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-edge bg-panel text-[12px] font-medium text-muted transition-colors hover:border-accent/50 hover:text-white">
      <Icon size={14} />{label}
    </button>
  );
  const rows = info ? [
    [t.other.screens, info.monitors || "—"], [t.other.sessionStart, fmtTime(info.bootTime)],
    [t.other.system, info.os], [t.other.installDate, fmtTime(info.installDate)],
    [t.other.ram, `${info.ramGb} GB`], [t.other.cpu, info.cpu], [t.other.gpu, info.gpu],
    [t.other.board, info.board], [t.other.vm, info.vm ? t.other.yes : t.other.no],
  ] : [];

  return (
    <div className="space-y-5 animate-fade-up">
      <TabHeader tab="other" t={t} actions={
        <button disabled={running} onClick={() => void run()} className="flex h-9 items-center gap-2 rounded-md border border-edge bg-panel px-3.5 text-[12px] font-semibold text-white hover:bg-edge disabled:opacity-50">
          {running ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}{t.runCheck}
        </button>
      } />
      {(error || actionError) && <p role="alert" className="text-[12px] text-red-300">{error || actionError}</p>}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-edge bg-panel px-4 py-2 shadow-card">
          {info ? rows.map(([label, value]) => (
            <div key={label} className="flex items-start gap-3 border-b border-edge/60 py-3 last:border-0">
              <Cpu size={13} className="mt-0.5 shrink-0 text-faint" />
              <div className="text-[12px] leading-relaxed"><span className="text-faint">{label}: </span><span className="text-muted">{value}</span></div>
            </div>
          )) : <div className="h-[350px] animate-pulse" />}
        </div>
        <div className="space-y-6">
          <section className="space-y-2.5">
            <p className="text-[10px] tracking-wider text-faint">{t.other.sysApps}</p>
            {button("datausage", t.other.dataUsage)}{button("nvidia", t.other.nvidia, Monitor)}{button("services", t.other.services)}
          </section>
          <section className="space-y-2.5">
            <p className="text-[10px] tracking-wider text-faint">{t.other.macros}</p>
            {button("mouse", t.other.mouse, Mouse)}
            <button disabled={running} onClick={() => void run()} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-accent/40 bg-accent/5 text-[12px] text-red-300 disabled:opacity-50">
              <RefreshCw size={13} />{t.other.macroRunning}
            </button>
            {info && <p className={`text-center text-[11px] ${info.macroFlags.length ? "text-amber-400" : "text-faint"}`}>
              {info.macroFlags.length ? `${t.other.macroFound}: ${info.macroFlags.join(", ")}` : t.other.macroNone}
            </p>}
          </section>
          <section className="space-y-2.5">
            <p className="text-[10px] tracking-wider text-faint">{t.other.keys}</p>
            <button onClick={() => setTab("processes")} className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-edge bg-panel text-[12px] text-muted hover:border-accent/40 hover:text-white">
              <Monitor size={14} />{t.other.autoCheck}
            </button>
            {button("osk", t.other.osk, Keyboard)}
          </section>
        </div>
      </div>
      <details className="rounded-lg border border-edge p-4">
        <summary className="cursor-pointer text-[12px] text-muted">{t.other.checks}</summary>
        <div className="mt-4"><ChecksTab t={t} tab="other" /></div>
      </details>
      <p className="text-[10px] text-faint">{t.compatibility}</p>
    </div>
  );
}
