// Variables to store our data
let startTime = null;
let timerInterval = null;
let gpsInterval = null;
let gpsData = {};

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
            gpsData[time] = `${latitude}, ${longitude}`;
            
            // Update live display
            lat.textContent = latitude;
            lon.textContent = longitude;
        },
        (error) => {
            console.error('GPS error:', error);
        }
    );
}

// Start tracking
function start() {
    // Ask for GPS permission and get first position
    navigator.geolocation.getCurrentPosition(
        (position) => {
            // Reset everything
            startTime = new Date();
            gpsData = {};
            
            // Log first GPS position
            const time = startTime.toISOString();
            const latitude = position.coords.latitude.toFixed(6);
            const longitude = position.coords.longitude.toFixed(6);
            gpsData[time] = `${latitude}, ${longitude}`;
            
            // Show and update live GPS display
            gpsDisplay.classList.remove('hidden');
            lat.textContent = latitude;
            lon.textContent = longitude;
            
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
function stop() {
    // Stop intervals
    clearInterval(timerInterval);
    clearInterval(gpsInterval);
    
    // Hide GPS display
    gpsDisplay.classList.add('hidden');
    
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