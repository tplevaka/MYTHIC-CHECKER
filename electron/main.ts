import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import { registerIpcHandlers } from "./backend";

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    frame: false,
    backgroundColor: "#0B0C10",
    show: false,
    title: "MYTHIC CHECKER",
    icon: path.join(__dirname, "../assets/icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  const devUrl = process.env.MYTHIC_DEV ? "http://localhost:5173" : null;
  if (devUrl) {
    void mainWindow.loadURL(devUrl);
  } else {
    void mainWindow.loadFile(path.join(__dirname, "../app-dist/index.html"));
  }
}

app.whenReady().then(() => {
  registerIpcHandlers(() => mainWindow);

  ipcMain.on("win:minimize", () => mainWindow?.minimize());
  ipcMain.on("win:toggle-maximize", () => {
    if (!mainWindow) return;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });
  ipcMain.on("win:close", () => mainWindow?.close());
  ipcMain.on("win:reload", () => mainWindow?.reload());

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
