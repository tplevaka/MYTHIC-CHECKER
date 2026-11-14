import { useState } from "react";
import type { TabId } from "@shared/types";
import CheatDetectPanel from "./components/CheatDetectPanel";
import Sidebar from "./components/Sidebar";
import StatusBar from "./components/StatusBar";
import Titlebar from "./components/Titlebar";
import { dictionaries, type Dict, type Lang } from "./i18n";
import FileSearchTab from "./tabs/FileSearch";
import { ActivityTab, ProcessesTab, RegistryTab, RenamedTab, UsbTab } from "./tabs/Generic";
import TracesTab from "./tabs/Traces";
import OtherTab from "./tabs/Other";
import SitesTab from "./tabs/Sites";
import SoftwareTab from "./tabs/Software";
import SteamTab from "./tabs/Steam";

export default function App() {
  const [lang, setLang] = useState<Lang>("en");
  const [tab, setTab] = useState<TabId>("traces");
  const t: Dict = dictionaries[lang];

  return (
    <div className="flex h-full flex-col bg-base">
      <Titlebar lang={lang} setLang={setLang} setTab={setTab} t={t} />
      <div className="flex min-h-0 flex-1">
        <Sidebar tab={tab} setTab={setTab} lang={lang} t={t} />
        <div className="relative min-w-0 flex-1">
        <main className="h-full overflow-y-auto p-6">
          <CheatDetectPanel t={t} setTab={setTab} />
          <div className={tab === "file-search" ? "" : "hidden"}><FileSearchTab t={t} /></div>
          {tab === "usb-devices" && <UsbTab t={t} />}
          {tab === "last-activity" && <ActivityTab t={t} />}
          {tab === "software" && <SoftwareTab t={t} setTab={setTab} />}
          {tab === "pc-registry" && <RegistryTab t={t} />}
          {tab === "steam-accounts" && <SteamTab t={t} />}
          <div className={tab === "traces" ? "" : "hidden"}><TracesTab t={t} /></div>
          {tab === "processes" && <ProcessesTab t={t} />}
          {tab === "renamed-files" && <RenamedTab t={t} />}
          {tab === "sites" && <SitesTab t={t} />}
          {tab === "other" && <OtherTab t={t} setTab={setTab} />}
        </main>
        </div>
      </div>
      <StatusBar t={t} />
    </div>
  );
}
