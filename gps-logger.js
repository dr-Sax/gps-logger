// Variables to store our data
let startTime = null;
let timerInterval = null;
let gpsInterval = null;
let gpsData = {};
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let db = null;

// Initialize IndexedDB
function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open('GPSTrackerDB', 1);
        
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains('recordings')) {
                db.createObjectStore('recordings', { keyPath: 'id', autoIncrement: true });
            }
        };
    });
}

// Save recording to IndexedDB
function saveRecording(audioBlob, gpsData, startTime) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['recordings'], 'readwrite');
        const objectStore = transaction.objectStore('recordings');
        
        const recording = {
            timestamp: startTime.toISOString(),
            audio: audioBlob,
            gpsData: gpsData,
            duration: Math.floor((new Date() - startTime) / 1000)
        };
        
        const request = objectStore.add(recording);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Load all recordings
function loadRecordings() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['recordings'], 'readonly');
        const objectStore = transaction.objectStore('recordings');
        const request = objectStore.getAll();
        
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

// Delete a recording
function deleteRecording(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(['recordings'], 'readwrite');
        const objectStore = transaction.objectStore('recordings');
        const request = objectStore.delete(id);
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

// Display recordings list
async function displayRecordings() {
    const recordings = await loadRecordings();
    const recordingsList = document.getElementById('recordingsList');
    const recordingsSection = document.getElementById('recordingsSection');
    
    if (recordings.length === 0) {
        recordingsSection.classList.add('hidden');
        return;
    }
    
    recordingsSection.classList.remove('hidden');
    recordingsList.innerHTML = '';
    
    recordings.reverse().forEach((recording) => {
        const div = document.createElement('div');
        div.className = 'recording-item';
        
        const date = new Date(recording.timestamp);
        const duration = Math.floor(recording.duration / 60) + 'm ' + (recording.duration % 60) + 's';
        
        div.innerHTML = `
            <div class="recording-info">
                <strong>${date.toLocaleString()}</strong>
                <div style="font-size: 12px; color: #666;">Duration: ${duration}</div>
            </div>
            <div class="recording-actions">
                <button onclick="playRecording(${recording.id})" class="play-btn">▶️ Play</button>
                <button onclick="downloadRecording(${recording.id})" class="download-btn">⬇️ Download</button>
                <button onclick="deleteRecordingById(${recording.id})" class="delete-btn">🗑️ Delete</button>
            </div>
        `;
        
        recordingsList.appendChild(div);
    });
}

// Play recording
window.playRecording = async function(id) {
    const transaction = db.transaction(['recordings'], 'readonly');
    const objectStore = transaction.objectStore('recordings');
    const request = objectStore.get(id);
    
    request.onsuccess = () => {
        const recording = request.result;
        const audioUrl = URL.createObjectURL(recording.audio);
        const audio = new Audio(audioUrl);
        audio.play();
        audio.onended = () => URL.revokeObjectURL(audioUrl);
    };
};

// Download recording (user-triggered, so it works!)
window.downloadRecording = async function(id) {
    const transaction = db.transaction(['recordings'], 'readonly');
    const objectStore = transaction.objectStore('recordings');
    const request = objectStore.get(id);
    
    request.onsuccess = () => {
        const recording = request.result;
        const audioUrl = URL.createObjectURL(recording.audio);
        const downloadLink = document.createElement('a');
        downloadLink.href = audioUrl;
        downloadLink.download = `gps-audio-${recording.timestamp.replace(/[:.]/g, '-')}.webm`;
        downloadLink.click();
        URL.revokeObjectURL(audioUrl);
    };
};

// Delete recording
window.deleteRecordingById = async function(id) {
    if (confirm('Delete this recording?')) {
        await deleteRecording(id);
        await displayRecordings();
    }
};

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

// Function to start audio recording
async function startAudioRecording() {
    try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(audioStream);
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

// Function to stop audio recording and save to IndexedDB
function stopAudioRecording() {
    return new Promise((resolve) => {
        if (!mediaRecorder || mediaRecorder.state === 'inactive') {
            resolve();
            return;
        }
        
        mediaRecorder.onstop = async () => {
            const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
            
            try {
                await saveRecording(audioBlob, gpsData, startTime);
                status.textContent = '✅ Recording saved! Check "My Recordings" below.';
                status.classList.remove('hidden');
                setTimeout(() => status.classList.add('hidden'), 3000);
                
                await displayRecordings();
            } catch (error) {
                console.error('Error saving recording:', error);
                alert('Error saving recording');
            }
            
            if (audioStream) {
                audioStream.getTracks().forEach(track => track.stop());
            }
            
            recordingStatus.classList.add('hidden');
            resolve();
        };
        
        mediaRecorder.stop();
    });
}

// Start tracking
async function start() {
    navigator.geolocation.getCurrentPosition(
        async (position) => {
            startTime = new Date();
            gpsData = {};
            
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

// Initialize app
initDB().then(() => {
    displayRecordings();
});

// Add click listeners
startBtn.addEventListener('click', start);
stopBtn.addEventListener('click', stop);
copyBtn.addEventListener('click', copy);
annotateBtn.addEventListener('click', addAnnotation);

annotationInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        addAnnotation();
    }
});