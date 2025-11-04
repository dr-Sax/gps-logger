// Variables to store our data
let startTime = null;
let timerInterval = null;
let gpsInterval = null;
let gpsData = {};
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;

// Get references to HTML elements
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const shareAudioBtn = document.getElementById('shareAudioBtn');
const shareJsonBtn = document.getElementById('shareJsonBtn');
const copyBtn = document.getElementById('copyBtn');
const timer = document.getElementById('timer');
const output = document.getElementById('output');
const jsonText = document.getElementById('jsonText');
const status = document.getElementById('status');
const gpsDisplay = document.getElementById('gpsDisplay');
const lat = document.getElementById('lat');
const lon = document.getElementById('lon');
const annotationBox = document.getElementById('annotationBox');
const annotationInput = document.getElementById('annotationInput');
const annotateBtn = document.getElementById('annotateBtn');
const liveOutput = document.getElementById('liveOutput');
const liveJsonText = document.getElementById('liveJsonText');
const recordingStatus = document.getElementById('recordingStatus');

let recordedAudioBlob = null;
let recordingTimestamp = null;

// Function to update the live JSON display
function updateLiveDisplay() {
    liveJsonText.value = JSON.stringify(gpsData, null, 2);
    liveJsonText.scrollTop = liveJsonText.scrollHeight;
}

// Function to update the timer display
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

// Function to log GPS position
function logGPS() {
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const time = new Date().toISOString();
            const latitude = position.coords.latitude.toFixed(6);
            const longitude = position.coords.longitude.toFixed(6);
            gpsData[time] = [`${latitude}, ${longitude}`];
            
            lat.textContent = latitude;
            lon.textContent = longitude;
            updateLiveDisplay();
        },
        (error) => {
            console.error('GPS error:', error);
        }
    );
}

// Function to add text annotation
function addAnnotation() {
    const text = annotationInput.value.trim();
    if (!text) {
        alert('Please enter some text');
        return;
    }
    
    navigator.geolocation.getCurrentPosition(
        (position) => {
            const time = new Date().toISOString();
            const latitude = position.coords.latitude.toFixed(6);
            const longitude = position.coords.longitude.toFixed(6);
            gpsData[time] = [`${latitude}, ${longitude}`, text];
            updateLiveDisplay();
            annotationInput.value = '';
        },
        (error) => {
            const time = new Date().toISOString();
            const lastLat = lat.textContent;
            const lastLon = lon.textContent;
            gpsData[time] = [`${lastLat}, ${lastLon}`, text];
            updateLiveDisplay();
            annotationInput.value = '';
        }
    );
}

// Function to convert WebM to MP3 (client-side using lamejs)
async function convertToMP3(webmBlob) {
    return new Promise((resolve, reject) => {
        // Create audio context to decode the audio
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const fileReader = new FileReader();
        
        fileReader.onload = async function(e) {
            try {
                const audioBuffer = await audioContext.decodeAudioData(e.target.result);
                
                // Get audio data
                const channels = audioBuffer.numberOfChannels;
                const sampleRate = audioBuffer.sampleRate;
                const samples = audioBuffer.getChannelData(0); // Get mono or first channel
                
                // Convert float samples to 16-bit PCM
                const buffer = new Int16Array(samples.length);
                for (let i = 0; i < samples.length; i++) {
                    const s = Math.max(-1, Math.min(1, samples[i]));
                    buffer[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                // Encode to MP3 using lamejs
                const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128);
                const mp3Data = [];
                
                const sampleBlockSize = 1152;
                for (let i = 0; i < buffer.length; i += sampleBlockSize) {
                    const sampleChunk = buffer.subarray(i, i + sampleBlockSize);
                    const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
                    if (mp3buf.length > 0) {
                        mp3Data.push(mp3buf);
                    }
                }
                
                // Finish encoding
                const mp3buf = mp3encoder.flush();
                if (mp3buf.length > 0) {
                    mp3Data.push(mp3buf);
                }
                
                // Create blob
                const mp3Blob = new Blob(mp3Data, { type: 'audio/mp3' });
                resolve(mp3Blob);
                
            } catch (error) {
                console.error('Error converting to MP3:', error);
                reject(error);
            }
        };
        
        fileReader.onerror = reject;
        fileReader.readAsArrayBuffer(webmBlob);
    });
}

// Function to start audio recording
async function startAudioRecording() {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Use best available format
        let options = { mimeType: 'audio/webm' };
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            options.mimeType = 'audio/webm;codecs=opus';
        }
        
        console.log('Recording with MIME type:', options.mimeType);
        
        mediaRecorder = new MediaRecorder(audioStream, options);
        audioChunks = [];
        
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        mediaRecorder.start();
        recordingStatus.textContent = '🔴 Recording Audio';
        recordingStatus.classList.remove('hidden');
        
        console.log('Audio recording started');
    } catch (error) {
        console.error('Error starting audio recording:', error);
        alert('Could not access microphone. Audio recording disabled.');
    }
}

// Function to stop audio recording
async function stopAudioRecording() {
    return new Promise((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            resolve();
            return;
        }
        
        mediaRecorder.onstop = async () => {
            const webmBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            console.log('WebM recording complete. Size:', webmBlob.size, 'bytes');
            
            // Show converting message
            recordingStatus.textContent = '⏳ Converting to MP3...';
            
            try {
                // Convert to MP3
                recordedAudioBlob = await convertToMP3(webmBlob);
                recordingTimestamp = new Date().toISOString();
                console.log('MP3 conversion complete. Size:', recordedAudioBlob.size, 'bytes');
                
                recordingStatus.classList.add('hidden');
            } catch (error) {
                console.error('MP3 conversion failed, using original format:', error);
                // Fallback to WebM if conversion fails
                recordedAudioBlob = webmBlob;
                recordingTimestamp = new Date().toISOString();
                recordingStatus.classList.add('hidden');
            }
            
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
            }
            
            resolve();
        };
        
        mediaRecorder.stop();
    });
}

// Share audio file
async function shareAudio() {
    if (!recordedAudioBlob) {
        alert('No recording available to share');
        return;
    }
    
    try {
        if (!navigator.share) {
            alert('Sharing not supported on this device');
            return;
        }
        
        const filename = `gps-audio-${recordingTimestamp.replace(/[:.]/g, '-').substring(0, 19)}.mp3`;
        const file = new File([recordedAudioBlob], filename, { type: 'audio/mp3' });
        
        await navigator.share({
            files: [file],
            title: 'GPS Audio Recording',
            text: `Recording from ${new Date(recordingTimestamp).toLocaleString()}`
        });
        
        status.textContent = '✅ Audio shared successfully!';
        status.classList.remove('hidden');
        setTimeout(() => status.classList.add('hidden'), 2000);
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Share error:', error);
            alert('Could not share audio: ' + error.message);
        }
    }
}

// Share JSON file
async function shareJSON() {
    try {
        if (!navigator.share) {
            alert('Sharing not supported on this device');
            return;
        }
        
        const jsonString = JSON.stringify(gpsData, null, 2);
        const jsonBlob = new Blob([jsonString], { type: 'application/json' });
        const filename = `gps-data-${new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)}.json`;
        const file = new File([jsonBlob], filename, { type: 'application/json' });
        
        await navigator.share({
            files: [file],
            title: 'GPS Data',
            text: 'GPS tracking data'
        });
        
        status.textContent = '✅ GPS data shared successfully!';
        status.classList.remove('hidden');
        setTimeout(() => status.classList.add('hidden'), 2000);
        
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Share error:', error);
            alert('Could not share GPS data: ' + error.message);
        }
    }
}

// Start tracking
async function start() {
    navigator.geolocation.getCurrentPosition(
        async (position) => {
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
        },
        (error) => {
            alert('Please allow location access');
        }
    );
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
}

// Copy JSON to clipboard
function copy() {
    jsonText.select();
    navigator.clipboard.writeText(jsonText.value)
        .then(() => {
            status.textContent = 'Copied!';
            status.classList.remove('hidden');
            setTimeout(() => {
                status.classList.add('hidden');
            }, 2000);
        });
}

// Add click listeners
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
shareAudioBtn.addEventListener('click', shareAudio);
shareJsonBtn.addEventListener('click', shareJSON);
copyBtn.addEventListener('click', copy);
annotateBtn.addEventListener('click', addAnnotation);

annotationInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addAnnotation();
    }
});