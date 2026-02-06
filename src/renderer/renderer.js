const { ipcRenderer, desktopCapturer } = require('electron');

// State
var mediaRecorder = null;
var recordedChunks = [];
var selectedBounds = null;
var mediaStream = null;
var isRecording = false;
var isPaused = false;
var recordingStartTime = 0;
var recordingDuration = 0;
var timerInterval = null;
var settings = null;
var areaOverlay = null;

// DOM Elements
var selectAreaBtn = document.getElementById('selectAreaBtn');
var selectSourceBtn = document.getElementById('selectSourceBtn');
var recordBtn = document.getElementById('recordBtn');
var pauseBtn = document.getElementById('pauseBtn');
var resumeBtn = document.getElementById('resumeBtn');
var stopBtn = document.getElementById('stopBtn');
var timer = document.getElementById('timer');
var statusDot = document.getElementById('statusDot');
var sourceInfo = document.getElementById('sourceInfo');
var sourcePicker = document.getElementById('sourcePicker');
var sourceList = document.getElementById('sourceList');
var settingsBtn = document.getElementById('settingsBtn');
var settingsPopup = document.getElementById('settingsPopup');
var browseDirBtn = document.getElementById('browseDirBtn');
var savePath = document.getElementById('savePath');
var qualitySelect = document.getElementById('qualitySelect');
var folderBtn = document.getElementById('folderBtn');
var minimizeBtn = document.getElementById('minimizeBtn');
var closeBtn = document.getElementById('closeBtn');

// Initialize
async function init() {
  console.log('Initializing...');
  settings = await ipcRenderer.invoke('get-settings');
  if (settings) {
    savePath.textContent = settings.saveDirectory;
    qualitySelect.value = settings.quality;
  }
  setupEventListeners();
  console.log('Ready');
}

// Create area overlay with corner brackets
function createAreaOverlay(bounds) {
  removeAreaOverlay();
  
  areaOverlay = document.createElement('div');
  areaOverlay.id = 'areaOverlay';
  areaOverlay.style.cssText = 'position:fixed;pointer-events:none;z-index:9999;' +
    'left:' + bounds.x + 'px;top:' + bounds.y + 'px;' +
    'width:' + bounds.width + 'px;height:' + bounds.height + 'px;';
  
  // Corner size
  var cs = 20;
  var border = '3px solid #e94560';
  
  // Top-left corner
  var tl = document.createElement('div');
  tl.style.cssText = 'position:absolute;top:0;left:0;width:' + cs + 'px;height:' + cs + 'px;' +
    'border-top:' + border + ';border-left:' + border + ';';
  
  // Top-right corner
  var tr = document.createElement('div');
  tr.style.cssText = 'position:absolute;top:0;right:0;width:' + cs + 'px;height:' + cs + 'px;' +
    'border-top:' + border + ';border-right:' + border + ';';
  
  // Bottom-left corner
  var bl = document.createElement('div');
  bl.style.cssText = 'position:absolute;bottom:0;left:0;width:' + cs + 'px;height:' + cs + 'px;' +
    'border-bottom:' + border + ';border-left:' + border + ';';
  
  // Bottom-right corner
  var br = document.createElement('div');
  br.style.cssText = 'position:absolute;bottom:0;right:0;width:' + cs + 'px;height:' + cs + 'px;' +
    'border-bottom:' + border + ';border-right:' + border + ';';
  
  areaOverlay.appendChild(tl);
  areaOverlay.appendChild(tr);
  areaOverlay.appendChild(bl);
  areaOverlay.appendChild(br);
  
  document.body.appendChild(areaOverlay);
}

function removeAreaOverlay() {
  if (areaOverlay) {
    areaOverlay.remove();
    areaOverlay = null;
  }
}

// Select area
function selectArea() {
  console.log('Opening area selector...');
  ipcRenderer.invoke('open-area-selector');
}

// Handle area selection
ipcRenderer.on('area-selected', function(event, bounds) {
  console.log('Area selected:', bounds);
  selectedBounds = bounds;
  sourceInfo.textContent = '⛶ ' + bounds.width + ' × ' + bounds.height;
  recordBtn.disabled = false;
  statusDot.className = 'status-dot ready';
});

// Start recording using desktopCapturer + getUserMedia (Electron native - no DirectX)
async function startRecording() {
  console.log('=== Starting recording ===');
  sourceInfo.textContent = '⏳ Initializing...';
  
  try {
    // Step 1: Get screen sources from main process
    console.log('Getting sources from main process...');
    var sources = await ipcRenderer.invoke('get-sources');
    console.log('Got', sources.length, 'sources');
    
    if (sources.length === 0) {
      sourceInfo.textContent = '❌ No sources found';
      return;
    }
    
    // Find a screen source
    var source = sources.find(function(s) { 
      return s.id.startsWith('screen:'); 
    }) || sources[0];
    
    console.log('Using source:', source.name, source.id);
    sourceInfo.textContent = '⏳ Capturing...';
    
    // Step 2: Use getUserMedia with chromeMediaSource (Electron-specific, avoids DirectX issues)
    var constraints = {
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop'
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: source.id,
          minWidth: 1280,
          maxWidth: 1920,
          minHeight: 720,
          maxHeight: 1080
        }
      }
    };
    
    console.log('Requesting stream with constraints...');
    
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (e1) {
      console.log('Failed with audio, trying video only...', e1.message);
      // Try without audio
      constraints.audio = false;
      mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    }
    
    console.log('Stream obtained!');
    console.log('Video tracks:', mediaStream.getVideoTracks().length);
    console.log('Audio tracks:', mediaStream.getAudioTracks().length);
    
    var videoTrack = mediaStream.getVideoTracks()[0];
    if (videoTrack) {
      var s = videoTrack.getSettings();
      console.log('Video:', s.width + 'x' + s.height);
      sourceInfo.textContent = '⏳ ' + s.width + 'x' + s.height;
    }
    
    // Check for supported codec
    var mimeType = 'video/webm;codecs=vp8';
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = 'video/webm';
    }
    console.log('Using mimeType:', mimeType);
    
    var bitrate = { medium: 2500000, high: 5000000, ultra: 8000000 };
    var options = {
      mimeType: mimeType,
      videoBitsPerSecond: bitrate[settings.quality] || 5000000
    };
    
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(mediaStream, options);
    
    mediaRecorder.ondataavailable = function(e) {
      console.log('Data chunk:', e.data.size, 'bytes');
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    
    mediaRecorder.onstop = function() {
      console.log('MediaRecorder stopped, chunks:', recordedChunks.length);
      saveRecording();
    };
    
    mediaRecorder.onerror = function(e) {
      console.error('MediaRecorder error:', e.error);
      sourceInfo.textContent = '❌ Recording error';
    };
    
    // Start recording - request data every 500ms for reliability
    mediaRecorder.start(500);
    console.log('Recording started!');
    
    isRecording = true;
    isPaused = false;
    recordingStartTime = Date.now();
    recordingDuration = 0;
    
    updateUI();
    startTimer();
    sourceInfo.textContent = '🔴 Recording...';
    
  } catch (err) {
    console.error('Failed to start recording:', err);
    sourceInfo.textContent = '❌ ' + (err.message || 'Capture failed');
    
    // Cleanup on error
    if (mediaStream) {
      mediaStream.getTracks().forEach(function(t) { t.stop(); });
      mediaStream = null;
    }
  }
}

// Pause
function pauseRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.pause();
    isPaused = true;
    recordingDuration += Date.now() - recordingStartTime;
    updateUI();
    console.log('Paused');
  }
}

// Resume
function resumeRecording() {
  if (mediaRecorder && mediaRecorder.state === 'paused') {
    mediaRecorder.resume();
    isPaused = false;
    recordingStartTime = Date.now();
    updateUI();
    console.log('Resumed');
  }
}

// Stop
function stopRecording() {
  console.log('Stopping recording...');
  
  if (mediaRecorder) {
    if (mediaRecorder.state === 'recording' || mediaRecorder.state === 'paused') {
      if (!isPaused) {
        recordingDuration += Date.now() - recordingStartTime;
      }
      // Request any pending data before stopping
      mediaRecorder.requestData();
      mediaRecorder.stop();
    }
  }
  
  isRecording = false;
  isPaused = false;
  stopTimer();
  updateUI();
  
  // Stop all tracks
  if (mediaStream) {
    mediaStream.getTracks().forEach(function(track) {
      console.log('Stopping track:', track.kind);
      track.stop();
    });
    mediaStream = null;
  }
  
  console.log('Recording stopped');
}

// Save recording
async function saveRecording() {
  console.log('Saving...', recordedChunks.length, 'chunks');
  
  if (recordedChunks.length === 0) {
    sourceInfo.textContent = '❌ No data recorded';
    console.error('No chunks to save');
    return;
  }
  
  var blob = new Blob(recordedChunks, { type: 'video/webm' });
  console.log('Blob size:', blob.size);
  
  if (blob.size === 0) {
    sourceInfo.textContent = '❌ Empty recording';
    return;
  }
  
  var buffer = await blob.arrayBuffer();
  var timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  var fileName = 'recording-' + timestamp + '.webm';
  
  var filePath = await ipcRenderer.invoke('save-video', buffer, fileName);
  sourceInfo.textContent = '✅ Saved!';
  console.log('Saved to:', filePath);
  
  recordedChunks = [];
  timer.textContent = '00:00';
}

// Timer
function startTimer() {
  timerInterval = setInterval(function() {
    if (!isPaused) {
      var elapsed = recordingDuration + (Date.now() - recordingStartTime);
      var secs = Math.floor(elapsed / 1000);
      var mins = Math.floor(secs / 60);
      secs = secs % 60;
      timer.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    }
  }, 200);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

// Update UI
function updateUI() {
  if (isRecording) {
    recordBtn.classList.add('hidden');
    stopBtn.classList.remove('hidden');
    
    if (isPaused) {
      pauseBtn.classList.add('hidden');
      resumeBtn.classList.remove('hidden');
      statusDot.className = 'status-dot paused';
    } else {
      pauseBtn.classList.remove('hidden');
      resumeBtn.classList.add('hidden');
      statusDot.className = 'status-dot recording';
    }
    
    selectSourceBtn.disabled = true;
    selectAreaBtn.disabled = true;
  } else {
    recordBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    pauseBtn.classList.add('hidden');
    resumeBtn.classList.add('hidden');
    statusDot.className = 'status-dot ready';
    
    selectSourceBtn.disabled = false;
    selectAreaBtn.disabled = false;
  }
}

// Load sources for picker
async function loadSources() {
  var sources = await ipcRenderer.invoke('get-sources');
  sourceList.innerHTML = '';
  
  sources.forEach(function(source) {
    var item = document.createElement('div');
    item.className = 'source-item';
    item.innerHTML = '<img src="' + source.thumbnail + '"><span>' + source.name + '</span>';
    item.onclick = function() {
      sourceInfo.textContent = '📺 ' + source.name.substring(0, 25);
      recordBtn.disabled = false;
      statusDot.className = 'status-dot ready';
      sourcePicker.classList.add('hidden');
    };
    sourceList.appendChild(item);
  });
}

// Event listeners
function setupEventListeners() {
  // Window controls
  minimizeBtn.onclick = function() { ipcRenderer.send('minimize-window'); };
  closeBtn.onclick = function() { ipcRenderer.send('close-window'); };
  
  // Source/area selection
  selectSourceBtn.onclick = async function() {
    await loadSources();
    sourcePicker.classList.toggle('hidden');
    settingsPopup.classList.add('hidden');
  };
  
  selectAreaBtn.onclick = selectArea;
  
  // Recording controls
  recordBtn.onclick = startRecording;
  pauseBtn.onclick = pauseRecording;
  resumeBtn.onclick = resumeRecording;
  stopBtn.onclick = stopRecording;
  
  // Settings
  settingsBtn.onclick = function() {
    settingsPopup.classList.toggle('hidden');
    sourcePicker.classList.add('hidden');
  };
  
  browseDirBtn.onclick = async function() {
    var dir = await ipcRenderer.invoke('select-directory');
    if (dir) {
      settings.saveDirectory = dir;
      savePath.textContent = dir;
    }
  };
  
  qualitySelect.onchange = async function() {
    settings.quality = qualitySelect.value;
    await ipcRenderer.invoke('save-settings', settings);
  };
  
  // Open folder
  folderBtn.onclick = function() {
    ipcRenderer.invoke('open-file-location', settings.saveDirectory + '\\.');
  };
  
  // Close popups on outside click
  document.onclick = function(e) {
    if (!sourcePicker.contains(e.target) && e.target !== selectSourceBtn) {
      sourcePicker.classList.add('hidden');
    }
    if (!settingsPopup.contains(e.target) && e.target !== settingsBtn) {
      settingsPopup.classList.add('hidden');
    }
  };
}

// Start
init();
