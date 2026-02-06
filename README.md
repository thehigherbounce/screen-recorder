# Screen Recorder

A powerful Electron-based screen recorder application with area selection, video recording, pause/resume functionality, video clipping, and MP4 export capabilities.

## Features

- 🖥️ **Screen & Window Recording** - Record your entire screen or specific windows
- 📐 **Area Selection** - Select a specific region of the screen to record
- ⏸️ **Pause/Resume** - Control your recording with pause and resume functionality
- ✂️ **Video Clipping** - Trim and clip recorded videos to desired length
- 💾 **Custom Save Directory** - Choose where to save your recordings
- ⚙️ **Quality Settings** - Adjust frame rate and video quality

## Installation

1. Make sure you have [Node.js](https://nodejs.org/) installed (v18 or higher recommended)

2. Clone or download this repository

3. Install dependencies:
   ```bash
   npm install
   ```

4. Run the application:
   ```bash
   npm start
   ```

## Development

### Available Commands

- `npm start` - Build and run the application
- `npm run dev` - Development mode with hot reload
- `npm run build` - Compile TypeScript only
- `npm run package:win` - Build Windows installer

### Project Structure

```
screen-recorder/
├── src/
│   ├── main/           # Electron main process
│   │   └── main.ts     # Main entry point
│   ├── renderer/       # Frontend files
│   │   ├── index.html  # Main UI
│   │   ├── styles.css  # Styles
│   │   ├── renderer.js # UI logic
│   │   └── area-selector.html  # Area selection overlay
│   └── types/          # TypeScript type definitions
│       └── index.ts
├── dist/               # Compiled output
├── assets/             # Application assets
├── package.json
└── tsconfig.json
```

## How to Use

### Recording

1. **Select Source**: Choose a screen or window to record from the source grid
2. **Select Area (Optional)**: Click "Select Area" to record a specific region
3. **Start Recording**: Click the red "Start" button to begin recording
4. **Pause/Resume**: Use the pause button to temporarily stop recording
5. **Stop**: Click "Stop" to end the recording

### Managing Recordings

- **Play**: Watch your recording in your default video player
- **Clip**: Trim the video to a specific time range
- **Folder**: Open the folder containing the recording
- **Delete**: Remove the recording from the list

### Settings

Access settings via the gear icon in the top-right corner:

- **Save Directory**: Choose where recordings are saved
- **Frame Rate**: Select 24, 30, or 60 FPS
- **Quality**: Choose from Low, Medium, High, or Ultra quality

## Building for Distribution

To create a Windows installer:

```bash
npm run package:win
```

The installer will be created in the `release` folder.

## Requirements

- Windows 10 or later
- Node.js 18+
- Screen recording permissions

## Technologies

- **Electron** - Cross-platform desktop app framework
- **TypeScript** - Type-safe JavaScript
- **MediaRecorder API** - Browser-based screen capture
- **FFmpeg** - Video processing for clipping

## License

MIT License
