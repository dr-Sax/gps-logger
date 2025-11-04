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

// Function to update the live JSON display
function updateLiveDisplay() {
    liveJsonText.value = JSON.stringify(gpsData, null, 2);
    // Auto-scroll to bottom
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
            
            // Update live display
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
            
            // Update live display
            updateLiveDisplay();
            
            // Clear input
            annotationInput.value = '';
        },
        (error) => {
            // If GPS fails, still add annotation with last known position
            const time = new Date().toISOString();
            const lastLat = lat.textContent;
            const lastLon = lon.textContent;
            gpsData[time] = [`${lastLat}, ${lastLon}`, text];
            updateLiveDisplay();
            annotationInput.value = '';
        }
    );
}

// Function to start audio recording
async function startAudioRecording() {
    try {
        // Request microphone access
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        // Create MediaRecorder
        mediaRecorder = new MediaRecorder(audioStream);
        audioChunks = [];
        
        // Collect audio data
        mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };
        
        // Start recording
        mediaRecorder.start();
        recordingStatus.textContent = '🔴 Recording Audio';
        recordingStatus.classList.remove('hidden');
        
        console.log('Audio recording started');
    } catch (error) {
        console.error('Error starting audio recording:', error);
        alert('Could not access microphone. Audio recording disabled.');
    }
}

// Function to stop audio recording and save file
function stopAudioRecording() {
    return new Promise((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            resolve();
            return;
        }
        
        mediaRecorder.onstop = () => {
            // Create audio blob
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            // Create download link
            const audioUrl = URL.createObjectURL(audioBlob);
            const downloadLink = document.createElement('a');
            downloadLink.href = audioUrl;
            
            // Generate filename with timestamp
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            downloadLink.download = `gps-audio-${timestamp}.webm`;
            
            // Trigger download
            document.body.appendChild(downloadLink);
            downloadLink.click();
            document.body.removeChild(downloadLink);
            
            // Clean up
            URL.revokeObjectURL(audioUrl);
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
            }
            
            recordingStatus.classList.add('hidden');
            console.log('Audio recording saved');
            resolve();
        };
        
        mediaRecorder.stop();
    });
}

// Start tracking
async function start() {
    // Ask for GPS permission and get first position
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            // Reset everything
            startTime = new Date();
            gpsData = {};
            
            // Log first GPS position
            const time = startTime.toISOString();
            const latitude = position.coords.latitude.toFixed(6);
            const longitude = position.coords.longitude.toFixed(6);
            gpsData[time] = [`${latitude}, ${longitude}`];
            
            // Show and update live GPS display
            gpsDisplay.classList.remove('hidden');
            lat.textContent = latitude;
            lon.textContent = longitude;
            
            // Show annotation box and live output
            annotationBox.classList.remove('hidden');
            liveOutput.classList.remove('hidden');
            updateLiveDisplay();
            
            // Start audio recording
            await startAudioRecording();
            
            // Start timer (updates every second)
            timerInterval = setInterval(updateTimer, 1000);
            
            // Log GPS every 30 seconds
            gpsInterval = setInterval(logGPS, 30000);
            
            // Update buttons
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
    // Stop audio recording first
    await stopAudioRecording();
    
    // Stop intervals
    clearInterval(timerInterval);
    clearInterval(gpsInterval);
    
    // Hide GPS display, annotation box, and live output
    gpsDisplay.classList.add('hidden');
    annotationBox.classList.add('hidden');
    liveOutput.classList.add('hidden');
    
    // Show JSON output
    jsonText.value = JSON.stringify(gpsData, null, 2);
    output.classList.remove('hidden');
    
    // Reset UI
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
copyBtn.addEventListener('click', copy);
annotateBtn.addEventListener('click', addAnnotation);

// Allow Enter key to add annotation
annotationInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addAnnotation();
    }
});