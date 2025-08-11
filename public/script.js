let watchId = null;
let locationCount = 0;

const elements = {
    requestPermission: document.getElementById('requestPermission'),
    getSingleLocation: document.getElementById('getSingleLocation'),
    startWatching: document.getElementById('startWatching'),
    stopWatching: document.getElementById('stopWatching'),
    status: document.getElementById('status'),
    qualityDisplay: document.getElementById('qualityDisplay'),
    locationDisplay: document.getElementById('locationDisplay'),
    logs: document.getElementById('logs'),
    apiUrl: document.getElementById('apiUrl'),
    accuracy: document.getElementById('accuracy'),
    timeout: document.getElementById('timeout'),
    maxAge: document.getElementById('maxAge'),
    currentUrl: document.getElementById('currentUrl')
};

function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;
    elements.logs.appendChild(logEntry);
    elements.logs.scrollTop = elements.logs.scrollHeight;
}

function showStatus(message, type = 'info') {
    elements.status.textContent = message;
    elements.status.className = `status ${type}`;
    elements.status.style.display = 'block';
}

function getLocationOptions() {
    return {
        enableHighAccuracy: elements.accuracy.value === 'true',
        timeout: parseInt(elements.timeout.value) * 1000,
        maximumAge: parseInt(elements.maxAge.value) * 1000
    };
}

async function sendLocationToAPI(locationData) {
    try {
        log(`API URL: ${elements.apiUrl.value}`);
        log(`Sending to API: ${locationData.latitude.toFixed(6)}, ${locationData.longitude.toFixed(6)} (±${locationData.accuracy}m)`);
        
        const requestBody = {
            location: locationData,
            requestId: `web-${Date.now()}-${locationCount}`,
            metadata: {
                userAgent: navigator.userAgent,
                connectionType: navigator.connection?.effectiveType || 'unknown',
                timestamp: Date.now(),
                platform: navigator.platform,
                origin: window.location.origin
            }
        };
        
        log(`Request body: ${JSON.stringify(requestBody, null, 2)}`);
        
        const response = await fetch(elements.apiUrl.value, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(requestBody)
        });

        log(`Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text();
            log(`Response error: ${errorText}`);
            throw new Error(`API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const result = await response.json();
        log(`API Response: Quality ${result.data.quality.score}/100 (${result.data.quality.grade})`);
        displayAPIResponse(result);
        return result;

    } catch (error) {
        log(`Detailed API Error: ${error.name} - ${error.message}`, 'error');
        if (error.stack) {
            log(`Error stack: ${error.stack}`, 'error');
        }
        showStatus(`Failed to send location to API: ${error.message}`, 'error');
        return null;
    }
}

function displayAPIResponse(result) {
    if (!result || !result.success) {
        return;
    }

    const { quality, processingTime } = result.data;

    const qualityClass = `quality-${quality.grade}`;
    elements.qualityDisplay.innerHTML = `
        <div class="quality-score ${qualityClass}">
            <div>
                <strong>GPS Quality: ${quality.grade.toUpperCase()}</strong>
                <div style="font-size: 14px; margin-top: 4px;">
                    Processing: ${processingTime}ms
                </div>
                ${quality.issues.length > 0 ? 
                    `<div style="font-size: 12px; margin-top: 8px;">
                        Issues: ${quality.issues.join(', ')}
                    </div>` : ''
                }
                ${quality.recommendations.length > 0 ? 
                    `<div style="font-size: 12px; margin-top: 4px;">
                        Tips: ${quality.recommendations.join(', ')}
                    </div>` : ''
                }
            </div>
            <div class="score-circle">${quality.score}</div>
        </div>
    `;
    elements.qualityDisplay.style.display = 'block';

    elements.locationDisplay.innerHTML = `
        <div class="location-data">${JSON.stringify(result.data, null, 2)}</div>
    `;
    elements.locationDisplay.style.display = 'block';
}

function processLocationSuccess(position) {
    locationCount++;
    
    const userAgent = navigator.userAgent.toLowerCase();
    let detectedPlatform = 'web';
    
    if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ios')) {
        detectedPlatform = 'ios';
    } else if (userAgent.includes('android')) {
        detectedPlatform = 'android';
    }
    
    const locationData = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
        speed: position.coords.speed,
        heading: position.coords.heading,
        altitude: position.coords.altitude,
        altitudeAccuracy: position.coords.altitudeAccuracy,
        platform: detectedPlatform, 
        source: 'gps'
    };

    log(`Location #${locationCount}: ${locationData.latitude.toFixed(6)}, ${locationData.longitude.toFixed(6)} (±${locationData.accuracy}m)`);
    showStatus(`Location received (±${locationData.accuracy}m accuracy)`, 'success');

    sendLocationToAPI(locationData);
}

function processLocationError(error) {
    let message = 'Unknown location error';
    let type = 'error';

    switch(error.code) {
        case error.PERMISSION_DENIED:
            message = 'Location permission denied by user';
            type = 'error';
            elements.getSingleLocation.disabled = true;
            elements.startWatching.disabled = true;
            break;
        case error.POSITION_UNAVAILABLE:
            message = 'Location information unavailable';
            type = 'warning';
            break;
        case error.TIMEOUT:
            message = 'Location request timed out';
            type = 'warning';
            break;
    }

    log(`Location Error: ${message}`);
    showStatus(message, type);
}

elements.requestPermission.addEventListener('click', async () => {
    if (!navigator.geolocation) {
        showStatus('Geolocation is not supported by this browser', 'error');
        log('Geolocation not supported');
        return;
    }

    log('Requesting location permission...');
    showStatus('Requesting location permission...', 'info');

    try {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                log('Location permission granted');
                showStatus('Location permission granted!', 'success');
                elements.requestPermission.disabled = true;
                elements.getSingleLocation.disabled = false;
                elements.startWatching.disabled = false;
                processLocationSuccess(position);
            },
            processLocationError,
            getLocationOptions()
        );
    } catch (error) {
        log(`Permission error: ${error.message}`);
        showStatus(`Permission error: ${error.message}`, 'error');
    }
});

elements.getSingleLocation.addEventListener('click', () => {
    log('Requesting single location...');
    showStatus('Getting location...', 'info');

    navigator.geolocation.getCurrentPosition(
        processLocationSuccess,
        processLocationError,
        getLocationOptions()
    );
});

elements.startWatching.addEventListener('click', () => {
    if (watchId !== null) return;

    log('Starting continuous location tracking...');
    showStatus('Starting continuous tracking...', 'info');

    watchId = navigator.geolocation.watchPosition(
        processLocationSuccess,
        processLocationError,
        getLocationOptions()
    );

    elements.startWatching.disabled = true;
    elements.stopWatching.disabled = false;
});

elements.stopWatching.addEventListener('click', () => {
    if (watchId === null) return;

    navigator.geolocation.clearWatch(watchId);
    watchId = null;

    log('Stopped continuous tracking');
    showStatus('Tracking stopped', 'info');

    elements.startWatching.disabled = false;
    elements.stopWatching.disabled = true;
});

function clearLogs() {
    elements.logs.innerHTML = '<div class="log-entry"><span class="log-timestamp">[Cleared]</span> Log cleared</div>';
}

document.addEventListener('DOMContentLoaded', () => {
    const currentOrigin = window.location.origin;
    const apiUrl = `${currentOrigin}/api/v1/location/test`;
    
    elements.apiUrl.value = apiUrl;
    elements.currentUrl.textContent = `API Endpoint: ${apiUrl}`;
    
    log(`Initialized with origin: ${currentOrigin}`);
    log(`API URL set to: ${apiUrl}`);
    log('GeoGuardian location testing ready');
    showStatus('Click "Request Location Permission" to begin testing', 'info');
});