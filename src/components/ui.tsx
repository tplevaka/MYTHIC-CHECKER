import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown } from "lucide-react";
import type { Dict } from "../i18n";

export function StageKicker({ stage, label }: { stage: string; label: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-bold tracking-[0.24em] text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_8px_#DC2626]" />
      {stage} · {label}
    </div>
  );
}

export function RiskBadge({ risk, t }: { risk: string; t: Dict }) {
  const label = t.risk[risk as keyof Dict["risk"]] ?? risk;
  const cls = risk === "high" ? "badge-high" : risk === "medium" ? "badge-medium" : "badge-low";
  return <span className={cls}>{label}</span>;
}

export function StatusBanner({
  state,
  found,
  t,
  currentPath,
}: {
  state: "idle" | "running" | "done" | "error";
  found: number;
  t: Dict;
  currentPath?: string;
}) {
  const title =
    state === "running" ? t.status.runningTitle : state === "done" ? t.status.doneTitle : state === "error" ? t.status.errorTitle : t.status.idleTitle;
  return (
    <div
      className={`flex items-center justify-between rounded-lg border bg-panel p-4 shadow-card ${
        state === "running" ? "border-accent/40" : state === "error" ? "border-accent/60" : "border-edge"
      }`}
    >
      <div className="flex items-center gap-3.5">
        <div
          className={`grid h-11 w-11 place-items-center rounded-md border ${
            state === "running"
              ? "border-accent/50 bg-accent/10 text-red-400"
              : "border-edge bg-base text-amber-400"
          }`}
        >
          <AlertTriangle size={20} />
        </div>
        <div className="min-w-0">
          <div className="text-[13.5px] font-bold text-white">{title}</div>
          <div className="mt-0.5 max-w-[520px] truncate text-[11.5px] text-muted">
            {state === "running" ? currentPath || t.scanning : t.status.idleDesc}
          </div>
          {state === "running" && (
            <div className="relative mt-2 h-1 w-[420px] max-w-full overflow-hidden rounded bg-edge">
              <div className="absolute inset-y-0 w-1/3 animate-scan-slide rounded bg-gradient-to-r from-transparent via-accent to-transparent" />
            </div>
          )}
        </div>
      </div>
      <div className="text-right">
        <div
          className={`font-mono text-[26px] font-bold leading-none ${
            found > 0 ? "text-red-400 drop-shadow-[0_0_10px_rgba(220,38,38,0.5)]" : "text-faint"
          }`}
        >
          {state === "idle" ? "—" : found}
        </div>
        <div className="mt-1 text-[10px] font-bold tracking-[0.2em] text-faint">{t.matches}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-xl border border-edge bg-base">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#565D6E" strokeWidth="2" strokeLinecap="round">
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </div>
      <div className="mt-4 text-[13.5px] font-semibold text-white">{title}</div>
      <div className="mt-1.5 max-w-[380px] text-[11.5px] leading-relaxed text-faint">{desc}</div>
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex h-9 items-center gap-2.5 rounded-md border border-edge bg-panel px-3 text-[12px] font-medium text-muted transition-colors hover:text-white"
    >
      <span
        className={`relative h-[16px] w-[30px] rounded-full transition-colors ${checked ? "bg-accent shadow-accent-glow" : "bg-edge"}`}
      >
        <span
          className={`absolute top-[2px] h-[12px] w-[12px] rounded-full bg-white transition-all ${checked ? "left-[16px]" : "left-[2px]"}`}
        />
      </span>
      {label}
    </button>
  );
}

export interface TypeOption {
  value: string;
  label: string;
}

export function TypeDropdown({
  options,
  selected,
  onToggle,
  allLabel,
}: {
  options: TypeOption[];
  selected: Set<string>;
  onToggle: (v: string) => void;
  allLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const allSelected = selected.size === options.length;

  return (
    <div ref={ref} className="relative">
      <button
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={`flex h-9 items-center gap-2 rounded-md border px-3 text-[12px] font-medium transition-colors ${
          open ? "border-accent/50 text-white" : "border-edge bg-panel text-muted hover:text-white"
        }`}
      >
        {allLabel}
        <span className="font-mono text-[10px] text-faint">
          {allSelected ? options.length : selected.size}/{options.length}
        </span>
        <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-[42px] z-30 w-[190px] space-y-0.5 rounded-lg border border-edge bg-panel p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.55)] animate-fade-up">
          {options.map((o) => {
            const on = selected.has(o.value);
            return (
              <button
                key={o.value}
                role="menuitemcheckbox"
                aria-checked={on}
                onClick={() => onToggle(o.value)}
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-[7px] text-left text-[12px] text-muted transition-colors hover:bg-edge/60 hover:text-white"
              >
                <span
                  className={`grid h-[15px] w-[15px] place-items-center rounded border transition-colors ${
                    on ? "border-accent bg-accent text-white" : "border-edge bg-base"
                  }`}
                >
                  {on && <Check size={11} strokeWidth={3} />}
                </span>
                <span className="font-mono text-[11.5px]">{o.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function fmtSize(bytes: number): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtTime(iso: string): string {
  if (!iso || iso === "—") return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
