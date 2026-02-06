import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, screen, shell, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

// Logging utility
function log(message: string, data?: any): void {
  const timestamp = new Date().toISOString().slice(11, 19);
  if (data !== undefined) {
    console.log(`[MAIN ${timestamp}] ${message}`, data);
  } else {
    console.log(`[MAIN ${timestamp}] ${message}`);
  }
}

log('Main process starting...');

// Disable hardware acceleration for better compatibility
app.disableHardwareAcceleration();

// Minimal flags - don't over-disable things
app.commandLine.appendSwitch('use-fake-ui-for-media-stream');
app.commandLine.appendSwitch('enable-usermedia-screen-capturing');

interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface AppSettings {
  saveDirectory: string;
  quality: 'medium' | 'high' | 'ultra';
}

let mainWindow: BrowserWindow | null = null;
let areaSelectionWindow: BrowserWindow | null = null;
let settings: AppSettings = {
  saveDirectory: app.getPath('videos'),
  quality: 'high'
};

const settingsPath = path.join(app.getPath('userData'), 'settings.json');

function loadSettings(): void {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      settings = { ...settings, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
}

function saveSettingsToFile(): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

function createMainWindow(): void {
  log('Creating main window...');
  mainWindow = new BrowserWindow({
    width: 320,
    height: 140,
    minWidth: 280,
    minHeight: 100,
    maxHeight: 400,
    frame: false,
    transparent: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    },
    icon: path.join(__dirname, '../../assets/icon.png'),
    title: 'Screen Recorder',
    backgroundColor: '#1a1a2e'
  });

  mainWindow.loadFile(path.join(__dirname, '../../src/renderer/index.html'));
  mainWindow.setAlwaysOnTop(true, 'floating');
  
  log('Main window created');

  mainWindow.on('closed', () => {
    log('Main window closed');
    mainWindow = null;
    app.quit();
  });
}

function createAreaSelectionWindow(displayId?: string): void {
  log('Creating area selection window...', { displayId });
  const displays = screen.getAllDisplays();
  log('Available displays', displays.length);
  const targetDisplay = displayId 
    ? displays.find(d => d.id.toString() === displayId) || displays[0]
    : screen.getPrimaryDisplay();
  log('Target display', targetDisplay.bounds);

  // Hide main window during selection
  mainWindow?.hide();
  log('Main window hidden');

  areaSelectionWindow = new BrowserWindow({
    x: targetDisplay.bounds.x,
    y: targetDisplay.bounds.y,
    width: targetDisplay.bounds.width,
    height: targetDisplay.bounds.height,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Maximize to cover full screen without using fullscreen mode
  areaSelectionWindow.maximize();
  areaSelectionWindow.setAlwaysOnTop(true, 'screen-saver');
  log('Area selection window maximized');

  areaSelectionWindow.loadFile(path.join(__dirname, '../../src/renderer/area-selector.html'));
  
  log('Area selector loaded');

  areaSelectionWindow.on('closed', () => {
    areaSelectionWindow = null;
    mainWindow?.show();
  });
}

// IPC Handlers
ipcMain.handle('get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 150, height: 90 }
  });

  return sources.map(source => ({
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    display_id: source.display_id
  }));
});

ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Save Directory'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    settings.saveDirectory = result.filePaths[0];
    saveSettingsToFile();
    return result.filePaths[0];
  }
  return undefined;
});

ipcMain.handle('save-video', async (_, buffer: ArrayBuffer, fileName: string) => {
  const filePath = path.join(settings.saveDirectory, fileName);
  
  if (!fs.existsSync(settings.saveDirectory)) {
    fs.mkdirSync(settings.saveDirectory, { recursive: true });
  }

  fs.writeFileSync(filePath, Buffer.from(buffer));
  return filePath;
});

ipcMain.handle('get-settings', () => settings);

ipcMain.handle('save-settings', (_, newSettings: Partial<AppSettings>) => {
  settings = { ...settings, ...newSettings };
  saveSettingsToFile();
});

ipcMain.handle('open-area-selector', (_, displayId?: string) => {
  log('IPC: open-area-selector called', displayId);
  createAreaSelectionWindow(displayId);
});

ipcMain.on('area-selected', (_, bounds: SelectionBounds) => {
  log('IPC: area-selected received', bounds);
  if (areaSelectionWindow) {
    areaSelectionWindow.close();
  }
  mainWindow?.webContents.send('area-selected', bounds);
  log('Area selection sent to renderer');
});

ipcMain.on('cancel-selection', () => {
  log('IPC: cancel-selection received');
  if (areaSelectionWindow) {
    areaSelectionWindow.close();
  }
});

ipcMain.handle('open-file-location', async (_, filePath: string) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('open-file', async (_, filePath: string) => {
  shell.openPath(filePath);
});

ipcMain.on('minimize-window', () => {
  mainWindow?.minimize();
});

ipcMain.on('close-window', () => {
  mainWindow?.close();
});

ipcMain.handle('get-screen-size', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    width: primaryDisplay.bounds.width,
    height: primaryDisplay.bounds.height
  };
});

// App lifecycle
app.whenReady().then(async () => {
  loadSettings();
  log('Settings loaded');
  
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
