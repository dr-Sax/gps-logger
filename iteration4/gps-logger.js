// Variables
let startTime = null;
let timerInterval = null;
let gpsInterval = null;
let gpsData = {};
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let recordedAudioBlob = null;
let audioContext = null;
let analyser = null;
let isSpeaking = false;
let silenceTimeout = null;
let isRecordingAudio = false;

// Pre-buffer variables
let preBufferRecorder = null;
let preBuffer = [];
const PRE_BUFFER_DURATION = 800; // Keep last 800ms of audio

// Configurable thresholds
const VOLUME_THRESHOLD = 30;
const SILENCE_DELAY = 1500;

// HTML elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const shareBtn = document.getElementById('shareBtn');
const filenameInput = document.getElementById('filenameInput');
const timer = document.getElementById('timer');
const output = document.getElementById('output');
const jsonText = document.getElementById('jsonText');
const gpsDisplay = document.getElementById('gpsDisplay');
const lat = document.getElementById('lat');
const lon = document.getElementById('lon');
const annotationBox = document.getElementById('annotationBox');
const annotationInput = document.getElementById('annotationInput');
const annotateBtn = document.getElementById('annotateBtn');
const liveOutput = document.getElementById('liveOutput');
const liveJsonText = document.getElementById('liveJsonText');
const recordingStatus = document.getElementById('recordingStatus');
const voiceIndicator = document.getElementById('voiceIndicator');

// Update live JSON display
function updateLiveDisplay() {
    liveJsonText.value = JSON.stringify(gpsData, null, 2);
    liveJsonText.scrollTop = liveJsonText.scrollHeight;
}

// Update timer
function updateTimer() {
    const now = new Date();
    const elapsed = Math.floor((now - startTime) / 1000);
    const hours = Math.floor(elapsed / 3600);
    const minutes = Math.floor((elapsed % 3600) / 60);
    const seconds = elapsed % 60;
    timer.textContent = 
        String(hours).padStart(2, '0') + ':' +
        String(minutes).padStart(2, '0') + ':' +
        String(seconds).padStart(2, '0');
}

// Log GPS position
function logGPS() {
    navigator.geolocation.getCurrentPosition((position) => {
        const time = new Date().toISOString();
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);
        gpsData[time] = [`${latitude}, ${longitude}`];
        lat.textContent = latitude;
        lon.textContent = longitude;
        updateLiveDisplay();
    });
}

// Add annotation
function addAnnotation() {
    const text = annotationInput.value.trim();
    if (!text) return;
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const time = new Date().toISOString();
            const latitude = position.coords.latitude.toFixed(6);
            const longitude = position.coords.longitude.toFixed(6);
            gpsData[time] = [`${latitude}, ${longitude}`, text];
            updateLiveDisplay();
            annotationInput.value = '';
        },
        () => {
            const time = new Date().toISOString();
            gpsData[time] = [`${lat.textContent}, ${lon.textContent}`, text];
            updateLiveDisplay();
            annotationInput.value = '';
        }
    );
}

// Get audio volume level
function getVolume() {
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(dataArray);
    const average = dataArray.reduce((a, b) => a + b) / dataArray.length;
    return average;
}

// Monitor audio for voice activity
function monitorVoiceActivity() {
    const volume = getVolume();
    
    if (volume > VOLUME_THRESHOLD) {
        // Voice detected
        if (!isSpeaking) {
            isSpeaking = true;
            voiceIndicator.textContent = '🎤 Voice Detected - Recording...';
            voiceIndicator.style.background = '#fee2e2';
            startRecording();
        }
        
        // Clear silence timeout
        if (silenceTimeout) {
            clearTimeout(silenceTimeout);
            silenceTimeout = null;
        }
        
        // Set new silence timeout
        silenceTimeout = setTimeout(() => {
            isSpeaking = false;
            voiceIndicator.textContent = '🔇 Listening for voice...';
            voiceIndicator.style.background = '#e0e7ff';
            stopRecording();
        }, SILENCE_DELAY);
    }
    
    // Continue monitoring
    if (audioStream) {
        requestAnimationFrame(monitorVoiceActivity);
    }
}

// Start pre-buffer recorder (always recording to buffer)
function startPreBuffer() {
    const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? { mimeType: 'audio/webm;codecs=opus' }
        : { mimeType: 'audio/webm' };
    
    preBufferRecorder = new MediaRecorder(audioStream, options);
    
    preBufferRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            preBuffer.push({
                data: event.data,
                timestamp: Date.now()
            });
            
            // Remove old chunks beyond buffer duration
            const cutoffTime = Date.now() - PRE_BUFFER_DURATION;
            preBuffer = preBuffer.filter(chunk => chunk.timestamp > cutoffTime);
        }
    };
    
    // Request data every 100ms to keep buffer fresh
    preBufferRecorder.start(100);
}

// Stop pre-buffer recorder
function stopPreBuffer() {
    if (preBufferRecorder && preBufferRecorder.state !== 'inactive') {
        preBufferRecorder.stop();
    }
}

// Start recording audio chunk (with pre-buffered audio)
function startRecording() {
    if (isRecordingAudio) return;
    
    // Add pre-buffered chunks to main recording
    preBuffer.forEach(chunk => {
        audioChunks.push(chunk.data);
    });
    
    const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? { mimeType: 'audio/webm;codecs=opus' }
        : { mimeType: 'audio/webm' };
    
    mediaRecorder = new MediaRecorder(audioStream, options);
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
    };
    
    mediaRecorder.start();
    isRecordingAudio = true;
}

// Stop recording audio chunk
function stopRecording() {
    if (!isRecordingAudio || !mediaRecorder) return;
    
    mediaRecorder.stop();
    isRecordingAudio = false;
}

// Convert to MP3
async function convertToMP3(webmBlob) {
    const tempAudioContext = new (window.AudioContext || window.webkitAudioContext)();
    const fileReader = new FileReader();
    
    return new Promise((resolve) => {
        fileReader.onload = async function(e) {
            const audioBuffer = await tempAudioContext.decodeAudioData(e.target.result);
            const sampleRate = audioBuffer.sampleRate;
            const samples = audioBuffer.getChannelData(0);
            
            const buffer = new Int16Array(samples.length);
            for (let i = 0; i < samples.length; i++) {
                const s = Math.max(-1, Math.min(1, samples[i]));
                buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            
            const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
            const mp3Data = [];
            const sampleBlockSize = 1152;
            
            for (let i = 0; i < buffer.length; i += sampleBlockSize) {
                const sampleChunk = buffer.subarray(i, i + sampleBlockSize);
                const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
                if (mp3buf.length > 0) mp3Data.push(mp3buf);
            }
            
            const mp3buf = mp3encoder.flush();
            if (mp3buf.length > 0) mp3Data.push(mp3buf);
            
            resolve(new Blob(mp3Data, { type: 'audio/mp3' }));
        };
        fileReader.readAsArrayBuffer(webmBlob);
    });
}

// Setup audio monitoring
async function setupAudioMonitoring() {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    
    const source = audioContext.createMediaStreamSource(audioStream);
    source.connect(analyser);
    
    voiceIndicator.classList.remove('hidden');
    voiceIndicator.textContent = '🔇 Listening for voice...';
    voiceIndicator.style.background = '#e0e7ff';
    
    // Start pre-buffering
    startPreBuffer();
    
    monitorVoiceActivity();
}

// Stop audio monitoring
async function stopAudioMonitoring() {
    if (silenceTimeout) clearTimeout(silenceTimeout);
    if (isRecordingAudio) stopRecording();
    
    stopPreBuffer();
    
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    voiceIndicator.classList.add('hidden');
    
    if (audioChunks.length > 0) {
        recordingStatus.textContent = '⏳ Converting to MP3...';
        recordingStatus.classList.remove('hidden');
        
        const webmBlob = new Blob(audioChunks, { type: 'audio/webm' });
        recordedAudioBlob = await convertToMP3(webmBlob);
        
        recordingStatus.classList.add('hidden');
    }
}

// Share both files
async function shareFiles() {
    const filename = filenameInput.value.trim() || 'gps-recording';
    
    const jsonString = JSON.stringify(gpsData, null, 2);
    const jsonBlob = new Blob([jsonString], { type: 'application/json' });
    
    const files = [new File([jsonBlob], `${filename}.json`, { type: 'application/json' })];
    
    if (recordedAudioBlob && recordedAudioBlob.size > 0) {
        files.push(new File([recordedAudioBlob], `${filename}.mp3`, { type: 'audio/mp3' }));
    }
    
    await navigator.share({
        files: files,
        title: filename
    });
}

// Start tracking
async function start() {
    navigator.geolocation.getCurrentPosition(async (position) => {
        startTime = new Date();
        gpsData = {};
        recordedAudioBlob = null;
        audioChunks = [];
        preBuffer = [];
        
        const time = startTime.toISOString();
        const latitude = position.coords.latitude.toFixed(6);
        const longitude = position.coords.longitude.toFixed(6);
        gpsData[time] = [`${latitude}, ${longitude}`];
        
        gpsDisplay.classList.remove('hidden');
        lat.textContent = latitude;
        lon.textContent = longitude;
        
        annotationBox.classList.remove('hidden');
        liveOutput.classList.remove('hidden');
        updateLiveDisplay();
        
        await setupAudioMonitoring();
        
        timerInterval = setInterval(updateTimer, 1000);
        gpsInterval = setInterval(logGPS, 30000);
        
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        output.classList.add('hidden');
    });
}

// Stop tracking
async function stop() {
    await stopAudioMonitoring();
    
    clearInterval(timerInterval);
    clearInterval(gpsInterval);
    
    gpsDisplay.classList.add('hidden');
    annotationBox.classList.add('hidden');
    liveOutput.classList.add('hidden');
    
    jsonText.value = JSON.stringify(gpsData, null, 2);
    output.classList.remove('hidden');
    
    timer.textContent = '00:00:00';
    startBtn.classList.remove('hidden');
    stopBtn.classList.add('hidden');
    
    const timestamp = new Date().toISOString().substring(0, 16).replace('T', '_').replace(/:/g, '-');
    filenameInput.value = `gps-${timestamp}`;
}

// Event listeners
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
shareBtn.addEventListener('click', shareFiles);
annotateBtn.addEventListener('click', addAnnotation);
annotationInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') addAnnotation();
});