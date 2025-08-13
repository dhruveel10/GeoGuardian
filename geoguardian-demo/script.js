let batchTrackingInterval = null;
let countdownInterval = null;
let batchNumber = 0;
let previousLocation = null;
let totalDistance = 0;
let batchStats = {
    total: 0,
    normal: 0,
    warning: 0,
    anomaly: 0
};

const elements = {
    requestPermission: document.getElementById('requestPermission'),
    startBatchTracking: document.getElementById('startBatchTracking'),
    stopBatchTracking: document.getElementById('stopBatchTracking'),
    transportMode: document.getElementById('transportMode'),
    environment: document.getElementById('environment'),
    batchInterval: document.getElementById('batchInterval'),
    countdown: document.getElementById('countdown'),
    countdownValue: document.getElementById('countdownValue'),
    status: document.getElementById('status'),
    stats: document.getElementById('stats'),
    batchContainer: document.getElementById('batchContainer'),
    logs: document.getElementById('logs'),
    totalBatches: document.getElementById('totalBatches'),
    normalBatches: document.getElementById('normalBatches'),
    anomalyBatches: document.getElementById('anomalyBatches'),
    totalDistance: document.getElementById('totalDistance')
};

const SPEED_LIMITS = {
    walking: 8,
    running: 20,
    cycling: 40,
    driving: 120,
    stationary: 0.5,
    unknown: 50
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

function updateStats() {
    elements.totalBatches.textContent = batchStats.total;
    elements.normalBatches.textContent = batchStats.normal;
    elements.anomalyBatches.textContent = batchStats.anomaly + batchStats.warning;
    elements.totalDistance.textContent = Math.round(totalDistance) + 'm';
    elements.stats.style.display = 'block';
}

function startCountdown(seconds) {
    let remaining = seconds;
    elements.countdownValue.textContent = remaining;
    elements.countdown.style.display = 'block';
    
    countdownInterval = setInterval(() => {
        remaining--;
        elements.countdownValue.textContent = remaining;
        
        if (remaining <= 0) {
            clearInterval(countdownInterval);
            elements.countdown.style.display = 'none';
        }
    }, 1000);
}

async function collectLocationReading() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            position => {
                const locationData = {
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    timestamp: Date.now(),
                    speed: position.coords.speed,
                    heading: position.coords.heading,
                    altitude: position.coords.altitude,
                    altitudeAccuracy: position.coords.altitudeAccuracy,
                    platform: detectPlatform(),
                    source: 'gps'
                };
                resolve(locationData);
            },
            error => reject(error),
            {
                enableHighAccuracy: true,
                timeout: 8000,
                maximumAge: 2000
            }
        );
    });
}

function detectPlatform() {
    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ios')) {
        return 'ios';
    } else if (userAgent.includes('android')) {
        return 'android';
    }
    return 'web';
}

function collectDeviceInfo() {
  return {
    platform: detectPlatform(),
    osVersion: navigator.platform,
    batteryLevel: navigator.getBattery ? undefined : undefined,
    connectionType: navigator.connection?.effectiveType || 'unknown',
    userAgent: navigator.userAgent
  };
}

async function getBatteryInfo() {
  try {
    if ('getBattery' in navigator) {
      const battery = await navigator.getBattery();
      return {
        level: Math.round(battery.level * 100),
        charging: battery.charging
      };
    }
  } catch (error) {
    return null;
  }
}

async function analyzeBatchMovement(fromLocation, toLocation, batchNum) {
  try {
    const apiUrl = `https://geoguardian-pa0d.onrender.com/api/v1/location/analyze-movement`;
    
    const batteryInfo = await getBatteryInfo();
    
    const requestBody = {
      previousLocation: fromLocation,
      currentLocation: toLocation,
      contextHints: {
        transportMode: elements.transportMode.value,
        environment: elements.environment.value
      },
      deviceInfo: {
        ...collectDeviceInfo(),
        batteryLevel: batteryInfo?.level,
        isCharging: batteryInfo?.charging
      },
      requestId: `batch-${batchNum}-${Date.now()}`
    };
    
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status}`);
    }

    const result = await response.json();
    return result.data;

  } catch (error) {
    log(`Batch ${batchNum} API Error: ${error.message}`, 'error');
    return null;
  }
}

function displayBatchResult(batchNum, fromLocation, toLocation, analysis) {
  if (!analysis) return;

  const classification = classifyBatchResult(analysis);
  const distance = analysis.distance || 0;
  
  totalDistance += distance;
  batchStats.total++;
  batchStats[classification.type]++;
  updateStats();

  const startTime = new Date(Date.now() - (parseInt(elements.batchInterval.value) * 1000));
  const endTime = new Date();
  
  const batchElement = document.createElement('div');
  batchElement.className = `batch ${classification.type}`;
  
  const statusIcon = classification.type === 'normal' ? '✅' : 
                    classification.type === 'warning' ? '⚠️' : '❌';
  
  const platformInfo = analysis.platformAnalysis ? 
    `${analysis.platformAnalysis.detectedPlatform.toUpperCase()}` : 'Unknown';
  
  const qualityInfo = analysis.qualityFactors ? 
    `${analysis.qualityFactors.signalQuality} signal, ${Math.round(analysis.qualityFactors.overallReliability * 100)}% reliable` : '';
  
  const riskInfo = analysis.metadata?.riskLevel ? 
    `Risk: ${analysis.metadata.riskLevel.toUpperCase()}` : '';

  batchElement.innerHTML = `
    <div class="batch-header">
      ${statusIcon} Batch #${batchNum} [${startTime.toLocaleTimeString()} → ${endTime.toLocaleTimeString()}]
    </div>
    <div class="batch-details">
      Distance: ${Math.round(distance)}m | Speed: ${analysis.impliedSpeed?.toFixed(1) || 0} km/h | Time: ${analysis.timeElapsed?.toFixed(1) || 0}s
    </div>
    <div class="batch-details">
      Platform: ${platformInfo} | ${qualityInfo} | ${riskInfo}
    </div>
    <div class="batch-details">
      From: ${fromLocation.latitude.toFixed(6)}, ${fromLocation.longitude.toFixed(6)} (±${Math.round(fromLocation.accuracy)}m)
    </div>
    <div class="batch-details">
      To: ${toLocation.latitude.toFixed(6)}, ${toLocation.longitude.toFixed(6)} (±${Math.round(toLocation.accuracy)}m)
    </div>
    <div class="batch-status">
      ${classification.reason}
      ${analysis.platformAnalysis?.platformSpecificIssues?.length > 0 ? 
        ` | Platform issues: ${analysis.platformAnalysis.platformSpecificIssues.join(', ')}` : ''}
    </div>
  `;
  
  elements.batchContainer.insertBefore(batchElement, elements.batchContainer.firstChild);
  elements.batchContainer.style.display = 'block';
}

function calculateDistance(loc1, loc2) {
    const R = 6371e3; 
    const φ1 = loc1.latitude * Math.PI/180;
    const φ2 = loc2.latitude * Math.PI/180;
    const Δφ = (loc2.latitude-loc1.latitude) * Math.PI/180;
    const Δλ = (loc2.longitude-loc1.longitude) * Math.PI/180;

    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    return R * c;
}

function classifyBatchResult(analysis) {
    if (!analysis) {
        return { type: 'anomaly', reason: 'API analysis failed' };
    }

    const transportMode = elements.transportMode.value;

    if (!analysis.accepted) {
        if (analysis.anomalyType === 'teleportation' || 
            (analysis.anomalyType === 'gps_drift' && transportMode === 'stationary') ||
            analysis.impliedSpeed > SPEED_LIMITS[transportMode] * 2) {
            return { type: 'anomaly', reason: analysis.reason };
        }
        return { type: 'warning', reason: analysis.reason };
    }

    if (transportMode === 'stationary') {
        return { type: 'normal', reason: analysis.reason };
    }

    const maxSpeed = SPEED_LIMITS[transportMode];
    if (analysis.impliedSpeed > maxSpeed * 0.8) {
        return { type: 'warning', reason: `High speed: ${analysis.impliedSpeed.toFixed(1)} km/h (near ${maxSpeed} km/h limit)` };
    }

    return { type: 'normal', reason: `Normal movement: ${analysis.impliedSpeed.toFixed(1)} km/h` };
}

async function processBatchReading() {
    try {
        showStatus('Collecting location reading...', 'info');
        const currentLocation = await collectLocationReading();
        
        batchNumber++;
        log(`Batch #${batchNumber}: Location collected at ${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)} (±${Math.round(currentLocation.accuracy)}m)`);
        
        if (previousLocation) {
            showStatus('Analyzing movement...', 'info');
            const analysis = await analyzeBatchMovement(previousLocation, currentLocation, batchNumber - 1);
            displayBatchResult(batchNumber - 1, previousLocation, currentLocation, analysis);
        } else {
            log('First location reading - no movement to analyze');
            batchStats.total++;
            updateStats();
        }
        
        previousLocation = currentLocation;
        
        const intervalSeconds = parseInt(elements.batchInterval.value);
        showStatus(`Batch #${batchNumber} complete. Next reading in ${intervalSeconds} seconds...`, 'success');
        startCountdown(intervalSeconds);
        
    } catch (error) {
        log(`Batch #${batchNumber + 1} failed: ${error.message}`, 'error');
        showStatus(`Failed to collect location: ${error.message}`, 'error');
        
        const intervalSeconds = parseInt(elements.batchInterval.value);
        startCountdown(intervalSeconds);
    }
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
        await collectLocationReading();
        log('Location permission granted');
        showStatus('Location permission granted!', 'success');
        elements.requestPermission.disabled = true;
        elements.startBatchTracking.disabled = false;
    } catch (error) {
        log(`Permission error: ${error.message}`);
        showStatus(`Permission error: ${error.message}`, 'error');
    }
});

elements.startBatchTracking.addEventListener('click', () => {
    const intervalSeconds = parseInt(elements.batchInterval.value);
    
    log(`Starting batch tracking every ${intervalSeconds} seconds...`);
    showStatus('Starting batch movement analysis...', 'info');
    
    batchNumber = 0;
    previousLocation = null;
    totalDistance = 0;
    batchStats = { total: 0, normal: 0, warning: 0, anomaly: 0 };
    elements.batchContainer.innerHTML = '';
    
    processBatchReading();
    
    batchTrackingInterval = setInterval(() => {
        processBatchReading();
    }, intervalSeconds * 1000);
    
    elements.startBatchTracking.disabled = true;
    elements.stopBatchTracking.disabled = false;
    elements.transportMode.disabled = true;
    elements.environment.disabled = true;
    elements.batchInterval.disabled = true;
});

elements.stopBatchTracking.addEventListener('click', () => {
    if (batchTrackingInterval) {
        clearInterval(batchTrackingInterval);
        batchTrackingInterval = null;
    }
    
    if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
    }
    
    elements.countdown.style.display = 'none';
    
    log('Batch tracking stopped');
    showStatus('Batch tracking stopped', 'info');
    
    elements.startBatchTracking.disabled = false;
    elements.stopBatchTracking.disabled = true;
    elements.transportMode.disabled = false;
    elements.environment.disabled = false;
    elements.batchInterval.disabled = false;
});

function clearLogs() {
    elements.logs.innerHTML = '<div class="log-entry"><span class="log-timestamp">[Cleared]</span> Log cleared</div>';
}

document.addEventListener('DOMContentLoaded', () => {
    log('GeoGuardian 10-second batch movement analysis ready');
    showStatus('Click "Request Location Permission" to begin testing', 'info');
});