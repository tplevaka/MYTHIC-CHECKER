# MYTHIC CHECKER v.1.4.0

Desktop application for checking a CS2 player's PC for cheats, prohibited software
and evasion traces. Windows + Linux, dark cyber UI, EN/UK localization.

## License

MYTHIC CHECKER application source is available under the MIT license in `LICENSE`.
Bundled third-party utilities retain their original licenses; MIT does not relicense
those binaries. RecentFilesView is freeware, not open-source, and must be redistributed
free of charge with all original files. System Informer includes its original MIT
license and third-party notices.

## Stack

- **Frontend:** React 18, TypeScript, Tailwind CSS, Lucide icons
- **Desktop:** Electron (frameless window, custom titlebar)
- **Backend:** Node.js modules with per-platform dispatch via `process.platform` (`win32` / `linux`)

## Run

```bash
npm install
npm run dev        # vite + electron with HMR
```

## Build

```bash
npm run dist:win      # MYTHIC-Checker-v1.4.0-setup.exe (NSIS)
npm run dist:linux    # AppImage + deb + tar.gz (run on Linux)
```

## Project structure

```
electron/
  main.ts               # frameless BrowserWindow, window controls IPC
  preload.ts            # contextBridge API (window.mythic), zoom, sound
  shared/types.ts       # contracts shared by main/renderer
  backend/
    index.ts            # IPC handlers + report assembly
    platform.ts         # win32/linux paths, scan roots, browser paths
    signatures.ts       # signature DB loader + matcher
    data/signatures.json# extendable cheat signature database
    scanner.ts          # recursive file search (names, folders, script patterns)
    steam.ts            # loginusers.vdf parser + optional VAC check
    usb.ts              # USBSTOR / MountPoints2 / lsusb / sysfs
    activity.ts         # Prefetch, Recent, RecycleBin / shell history, Trash
    software.ts         # uninstall registry / .desktop + recent installers
    registry.ts         # BAM/DAM, MuiCache, AppCompatCache / env + journalctl
    processes.ts        # tasklist + cs2 modules / /proc maps + LD_PRELOAD
    renamed.ts          # NTFS USN journal renames/deletes + PE-MZ/ELF magic + trash metadata
    sites.ts            # browser history byte-scan for cheat domains + hosts
    system.ts           # drives list, system info (CPU/GPU/RAM/monitors/macros), admin utilities
    other.ts            # secure boot, testsigning, IFEO, ptrace_scope, traces
src/
  i18n.ts               # full EN / UK dictionaries (instant switching)
  App.tsx               # layout: titlebar + sidebar + tab content + status bar
  components/           # Titlebar, Sidebar, StatusBar, TabHeader, ui kit
  tabs/                 # FileSearch + Generic-driven tabs (USB, Steam, ...)
```

## Extending signatures

Edit `electron/backend/data/signatures.json` (also shipped as an extraResource,
so it can be replaced post-install without rebuilding):

- `cheats[]` — known cheat name, risk, file names, folder names, script extensions
- `cheatDomains` — cheat forums/sites checked in browser history and hosts
- `cheatProcesses` — process names flagged live
- `scriptPatterns` — regexes applied to `.lua/.cfg/.js` contents

## VAC status

Accounts are merged from readable Steam login/config records and userdata folders,
including custom installations selected with "Select Steam folder". Native Linux,
Flatpak and Snap Steam paths are considered. Deleted/unreadable records cannot be recovered.
VAC status is shown on every account and is separate from game-ban counters.
Public profile data requires Internet; failures remain unknown, never clean.
`MYTHIC_STEAM_API_KEY` enables official GetPlayerBans queries (100 accounts per batch).
If Steam returns an App 730 ban record, its BanStartTime is shown in UTC as a CS2 ban.
Global VAC/game-ban counters alone do not identify CS2. DaysSinceLastBan gives only
an approximate calendar date for the latest ban in any game, not an exact CS2 timestamp.
The key is never bundled or included in reports.

## Report

The footer exports the accumulated results of all checks as JSON
(save to file or copy to clipboard for the tournament admin).

## Feature notes

- **File Search** opens a mode dialog: quick scan, system drive, manual drive
  selection (live drive list with free space) or custom folders.
- **Sites** tiles and "Open all" launch URLs in the system browser via
  `shell.openExternal` (scheme-restricted to http/https).
- **Software** groups 12 utility cards by files, browsers, game and registry.
  Windows includes unmodified RecentFilesView 1.33 and System Informer 4.0.26241.138
  with their original notices. Those two launch locally, never their download pages.
  Other Windows tools use discovered executables, explicit fallbacks or download pages.
  Linux Recent files reads the user's XDG recent-file database, and Process monitor
  shows native processes/CS2 mappings; unrelated Windows-only tools are disabled.
  RecentFilesView must only be redistributed free of charge with all original files.
- **Steam Accounts** shows the most recently used retained account and other
  saved accounts. Public avatars, levels and profile details load when available;
  the export button saves JSON and copies it to the clipboard. The current PC's
  IP is not presented as a historical Steam session IP.
- **Traces / Anti-evasion** is the startup page. It presents evidence cards for
  known launch/deletion filenames, Windows Prefetch gaps, read-only Defender
  exclusions and log/USN availability; Linux checks shell cleanup commands and
  accessible systemd journal integrity. Access failures are unknown, not proof
  of evasion; normal maintenance and filename collisions require manual review.
- **Linux** delivery is a self-contained x64 glibc tar.gz. See LINUX-GUIDE.md.
  A Linux runtime was not available on the Windows build host, so native Linux
  execution is not claimed as verified. Windows-only registry/NTFS checks are
  replaced by available Linux sources, not emulated.
- **Browser traces** appear automatically at startup when matching cheat domains
  are found in readable browser data. Matches are not proof of cheat installation;
  no matches do not prove a clean PC. Files over 64 MiB and inaccessible data may
  be skipped.
- **Windows installer** targets Windows 10/11 x64 and includes the Electron/Node
  runtime. End users do not need Node.js installed. Some checks require elevated
  permissions, retained history or Internet access; not every check is available
  on every PC.
- **Renamed Files** parses the NTFS USN journal on Windows (rename-old →
  rename-new pairing surfaces e.g. `neverlose.exe → Titlebar.tsx`) and falls
  back to PE/ELF magic mismatch plus Linux trash metadata.
