// Variables
let startTime = null;
let timerInterval = null;
let gpsInterval = null;
let gpsData = {};
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let recordedAudioBlob = null;

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

// Convert to MP3
async function convertToMP3(webmBlob) {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const fileReader = new FileReader();
    
    return new Promise((resolve) => {
        fileReader.onload = async function(e) {
            const audioBuffer = await audioContext.decodeAudioData(e.target.result);
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

// Start audio recording
async function startAudioRecording() {
    audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const options = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') 
        ? { mimeType: 'audio/webm;codecs=opus' }
        : { mimeType: 'audio/webm' };
    
    mediaRecorder = new MediaRecorder(audioStream, options);
    audioChunks = [];
    
    mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
    };
    
    mediaRecorder.start();
    recordingStatus.textContent = '🔴 Recording';
    recordingStatus.classList.remove('hidden');
}

// Stop audio recording
async function stopAudioRecording() {
    return new Promise((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            resolve();
            return;
        }
        
        mediaRecorder.onstop = async () => {
            const webmBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            recordingStatus.textContent = '⏳ Converting to MP3...';
            recordedAudioBlob = await convertToMP3(webmBlob);
            recordingStatus.classList.add('hidden');
            audioStream.getTracks().forEach(track => track.stop());
            resolve();
        };
        
        mediaRecorder.stop();
    });
}

// Share both files
async function shareFiles() {
    const filename = filenameInput.value.trim() || 'gps-recording';
    
    const jsonString = JSON.stringify(gpsData, null, 2);
    const jsonBlob = new Blob([jsonString], { type: 'application/json' });
    
    const audioFile = new File([recordedAudioBlob], `${filename}.mp3`, { type: 'audio/mp3' });
    const jsonFile = new File([jsonBlob], `${filename}.json`, { type: 'application/json' });
    
    await navigator.share({
        files: [audioFile, jsonFile],
        title: filename
    });
}

// Start tracking
async function start() {
    navigator.geolocation.getCurrentPosition(async (position) => {
        startTime = new Date();
        gpsData = {};
        recordedAudioBlob = null;
        
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
        
        await startAudioRecording();
        
        timerInterval = setInterval(updateTimer, 1000);
        gpsInterval = setInterval(logGPS, 30000);
        
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
        output.classList.add('hidden');
    });
}

// Stop tracking
async function stop() {
    await stopAudioRecording();
    
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
    
    // Set default filename
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