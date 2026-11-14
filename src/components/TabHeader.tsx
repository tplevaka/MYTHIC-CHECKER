import { FolderOpen, Loader2, Play, Search, Square } from "lucide-react";
import type { TabId } from "@shared/types";
import type { Dict } from "../i18n";
import { StageKicker } from "./ui";

export function TabHeader({
  tab,
  t,
  actions,
}: {
  tab: TabId;
  t: Dict;
  actions?: React.ReactNode;
}) {
  const label = t.nav[tab];
  const stage = `${t.stage} ${t.stages[tab]}`;
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <StageKicker stage={stage} label={label.toUpperCase()} />
        <h1 className="mt-2 text-[22px] font-extrabold leading-none text-white">{label}</h1>
        <p className="mt-2 max-w-[640px] text-[12px] leading-relaxed text-muted">{t.subtitles[tab]}</p>
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2.5 pt-6">{actions}</div>}
    </div>
  );
}

export function SelectFoldersButton({ onClick, t }: { onClick: () => void; t: Dict }) {
  return (
    <button
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-md border border-edge bg-panel px-3.5 text-[12px] font-semibold text-white transition-colors hover:border-edgeLight hover:bg-edge"
    >
      <FolderOpen size={14} className="text-muted" />
      {t.selectFolders}
    </button>
  );
}

export function RunButton({
  onClick,
  t,
  running,
  label,
}: {
  onClick: () => void;
  t: Dict;
  running: boolean;
  label?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={running}
      className="flex h-9 items-center gap-2 rounded-md bg-accent px-4 text-[12px] font-bold text-white shadow-accent-glow transition-all hover:bg-red-700 disabled:opacity-60"
    >
      {running ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          {t.scanning}
        </>
      ) : (
        <>
          <Play size={14} />
          {label ?? t.startSearch}
        </>
      )}
    </button>
  );
}

export function StopButton({ onClick, t }: { onClick: () => void; t: Dict }) {
  return (
    <button
      onClick={onClick}
      className="flex h-9 items-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-3.5 text-[12px] font-bold text-red-400 transition-colors hover:bg-accent/20"
    >
      <Square size={12} />
      {t.stop}
    </button>
  );
}

export function FilterBar({
  value,
  onChange,
  t,
  right,
}: {
  value: string;
  onChange: (v: string) => void;
  t: Dict;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex h-9 w-[320px] items-center gap-2 rounded-md border border-edge bg-panel px-3 focus-within:border-accent/50">
        <Search size={14} className="text-faint" />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t.filterPlaceholder}
          className="w-full bg-transparent text-[12px] text-white outline-none placeholder:text-faint"
        />
      </div>
      <div className="flex flex-wrap items-center gap-3">{right}</div>
    </div>
  );
}
