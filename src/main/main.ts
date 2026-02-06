import { app, BrowserWindow, ipcMain, desktopCapturer, dialog, screen, shell, globalShortcut } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';

// Get FFmpeg path
let ffmpegPath: string;
try {
  ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
} catch {
  ffmpegPath = 'ffmpeg'; // Fallback to system ffmpeg
}

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
  frameRate: 24 | 30 | 60;
}

let mainWindow: BrowserWindow | null = null;
let areaSelectionWindow: BrowserWindow | null = null;
let settings: AppSettings = {
  saveDirectory: app.getPath('videos'),
  quality: 'high',
  frameRate: 30
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
  
  // Calculate bounds that span ALL displays for multi-monitor support
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  
  displays.forEach(display => {
    minX = Math.min(minX, display.bounds.x);
    minY = Math.min(minY, display.bounds.y);
    maxX = Math.max(maxX, display.bounds.x + display.bounds.width);
    maxY = Math.max(maxY, display.bounds.y + display.bounds.height);
  });
  
  const totalBounds = {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY
  };
  
  log('Total display bounds (all monitors)', totalBounds);

  // Hide main window during selection
  mainWindow?.hide();
  log('Main window hidden');

  areaSelectionWindow = new BrowserWindow({
    x: totalBounds.x,
    y: totalBounds.y,
    width: totalBounds.width,
    height: totalBounds.height,
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

  // Don't maximize - use exact bounds to span all monitors
  areaSelectionWindow.setAlwaysOnTop(true, 'screen-saver');
  log('Area selection window created spanning all monitors');

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

ipcMain.on('resize-window', (_, height: number) => {
  if (mainWindow) {
    const [width] = mainWindow.getSize();
    mainWindow.setSize(width, height, true);
  }
});

ipcMain.handle('get-screen-size', () => {
  const primaryDisplay = screen.getPrimaryDisplay();
  return {
    width: primaryDisplay.bounds.width,
    height: primaryDisplay.bounds.height
  };
});

// Clip video using FFmpeg
ipcMain.handle('clip-video', async (_, inputPath: string, startTime: string, endTime: string) => {
  log('Clipping video', { inputPath, startTime, endTime });
  
  const ext = path.extname(inputPath);
  const basename = path.basename(inputPath, ext);
  const outputPath = path.join(path.dirname(inputPath), `${basename}_clip${ext}`);
  
  return new Promise((resolve, reject) => {
    // Convert time format (M:SS or MM:SS) to seconds
    const parseTime = (t: string): number => {
      const parts = t.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
      return Number(t) || 0;
    };
    
    const start = parseTime(startTime);
    const end = parseTime(endTime);
    const duration = end - start;
    
    if (duration <= 0) {
      reject(new Error('End time must be after start time'));
      return;
    }
    
    const args = [
      '-i', inputPath,
      '-ss', start.toString(),
      '-t', duration.toString(),
      '-c', 'copy', // Fast copy without re-encoding
      '-y', // Overwrite output
      outputPath
    ];
    
    log('Running FFmpeg', { ffmpegPath, args });
    
    const proc = childProcess.spawn(ffmpegPath, args);
    
    proc.on('close', (code) => {
      if (code === 0) {
        log('Clip saved', outputPath);
        resolve(outputPath);
      } else {
        reject(new Error(`FFmpeg exited with code ${code}`));
      }
    });
    
    proc.on('error', (err) => {
      log('FFmpeg error', err);
      reject(err);
    });
  });
});

// Get video duration
ipcMain.handle('get-video-duration', async (_, filePath: string) => {
  return new Promise((resolve) => {
    const args = [
      '-i', filePath,
      '-show_entries', 'format=duration',
      '-v', 'quiet',
      '-of', 'csv=p=0'
    ];
    
    // Use ffprobe if available, otherwise estimate
    const ffprobePath = ffmpegPath.replace('ffmpeg', 'ffprobe');
    
    const proc = childProcess.spawn(ffprobePath, args);
    let output = '';
    
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    proc.on('close', () => {
      const duration = parseFloat(output.trim()) || 0;
      resolve(duration);
    });
    
    proc.on('error', () => {
      resolve(0); // Return 0 if ffprobe not available
    });
  });
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
