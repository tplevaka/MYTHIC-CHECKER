import { useState } from "react";
import type { OtherCheck } from "@shared/types";
import { api } from "../api";
import { FilterBar, RunButton, TabHeader } from "../components/TabHeader";
import { fmtTime } from "../components/ui";
import type { Dict } from "../i18n";
import { useTabData } from "./Generic";

const borders = { fail: "border-l-red-500", warn: "border-l-amber-400", info: "border-l-sky-500", ok: "border-l-emerald-500" };
const badges = { fail: "text-red-300 bg-red-500/15", warn: "text-amber-300 bg-amber-500/15", info: "text-sky-300 bg-sky-500/15", ok: "text-emerald-300 bg-emerald-500/15" };

export default function TracesTab({ t }: { t: Dict }) {
  const { data, running, error, run, generatedAt, lastDuration } = useTabData<OtherCheck>(() => api().getTraces(), true);
  const [filter, setFilter] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const checks = data ?? [];
  const alerts = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const unknown = checks.filter((c) => c.status === "info").length;
  const q = filter.toLowerCase().trim();
  const visible = checks.filter((c) => !q || [t.traceNames[c.id] ?? c.name, c.detail, ...(c.evidence ?? [])].some((v) => v.toLowerCase().includes(q)));
  return <div className="space-y-4 animate-fade-up">
    <TabHeader tab="traces" t={t} actions={<>
      {generatedAt && <span className="font-mono text-[10px] text-faint">{fmtTime(generatedAt)} · {lastDuration} ms</span>}
      <RunButton t={t} running={running} label={t.runCheck} onClick={() => void run()} />
    </>} />
    {error && <p role="alert" className="rounded-lg border border-accent/40 bg-accent/10 p-3 text-[12px] text-red-300">{error}</p>}
    <section role="status" className="flex items-center justify-between gap-4 rounded-lg border border-edge bg-panel px-5 py-5">
      <div><h2 className="text-[15px] font-bold text-white">{running ? t.scanning : !data || error ? t.status.errorTitle : !checks.length ? t.tracePanel.unknown : alerts + warnings ? t.tracePanel.detected : t.tracePanel.clear}</h2>
        <p className="mt-1.5 text-[11px] text-faint">{t.tracePanel.alarm}: {alerts} · {t.tracePanel.caution}: {warnings} · {t.tracePanel.unknown}: {unknown}</p>
      </div>
      <div className="shrink-0 text-right"><div className="font-mono text-[30px] font-bold text-white">{running || !data ? "—" : alerts + warnings}</div><div className="text-[8px] tracking-wider text-faint">{t.tracePanel.signals}</div></div>
    </section>
    <p className="text-[11px] leading-relaxed text-faint">{t.tracePanel.hint}</p>
    <FilterBar value={filter} onChange={setFilter} t={t} />
    <div className="space-y-2.5">
      {visible.map((c) => <article key={c.id} className={`rounded-lg border border-edge border-l-[3px] bg-panel p-4 ${borders[c.status]}`}>
        <div className="flex items-start justify-between gap-4"><h3 className="text-[13px] font-bold text-white">{t.traceNames[c.id] ?? c.name}</h3><span className={`shrink-0 rounded px-2 py-1 text-[8px] font-semibold uppercase ${badges[c.status]}`}>{t.checkStatus[c.status]}</span></div>
        <p className="mt-1.5 break-words text-[11.5px] leading-relaxed text-muted">{c.detail}</p>
        {!!c.evidence?.length && <>
          <button aria-expanded={expanded.has(c.id)} className="mt-3 rounded-md border border-edge px-3 py-1.5 text-[11px] text-muted hover:border-accent/40 hover:text-white" onClick={() => setExpanded((prev) => {
            const next = new Set(prev);
            if (next.has(c.id)) next.delete(c.id); else next.add(c.id);
            return next;
          })}>{expanded.has(c.id) ? t.tracePanel.hide : t.tracePanel.show} · {c.evidence.length}</button>
          {expanded.has(c.id) && <ul className="mt-3 max-h-64 space-y-2 overflow-auto rounded-md border border-edge bg-base p-3 font-mono text-[10px] text-muted">{c.evidence.map((e, i) => <li key={i} className="whitespace-pre-wrap break-all">{e}</li>)}</ul>}
        </>}
      </article>)}
      {!running && data && !visible.length && <p className="py-8 text-center text-[12px] text-faint">{t.empty.generic.title}</p>}
    </div>
  </div>;
}
