// Type definitions for Screen Recorder

export interface RecordingOptions {
  sourceId: string;
  bounds?: SelectionBounds;
  frameRate?: number;
  videoBitsPerSecond?: number;
}

export interface SelectionBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SourceInfo {
  id: string;
  name: string;
  thumbnail: string;
  display_id?: string;
}

export interface RecordingState {
  isRecording: boolean;
  isPaused: boolean;
  duration: number;
  filePath?: string;
}

export interface ClipOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  endTime: number;
}

export interface SaveDialogResult {
  canceled: boolean;
  filePath?: string;
}

export interface AppSettings {
  saveDirectory: string;
  defaultFormat: 'mp4' | 'webm';
  frameRate: number;
  quality: 'low' | 'medium' | 'high' | 'ultra';
}

// IPC Channel names
export const IPC_CHANNELS = {
  GET_SOURCES: 'get-sources',
  START_RECORDING: 'start-recording',
  STOP_RECORDING: 'stop-recording',
  PAUSE_RECORDING: 'pause-recording',
  RESUME_RECORDING: 'resume-recording',
  SAVE_VIDEO: 'save-video',
  CLIP_VIDEO: 'clip-video',
  SELECT_DIRECTORY: 'select-directory',
  GET_SETTINGS: 'get-settings',
  SAVE_SETTINGS: 'save-settings',
  OPEN_AREA_SELECTOR: 'open-area-selector',
  AREA_SELECTED: 'area-selected',
  CANCEL_SELECTION: 'cancel-selection'
} as const;
