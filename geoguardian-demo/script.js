let previousLocation = null;
let qualityTrackingInterval = null;
let movementTrackingInterval = null;
let batchTrackingInterval = null;
let countdownInterval = null;
let batchNumber = 0;
let totalDistance = 0;
let batchStats = { total: 0, normal: 0, warning: 0, anomaly: 0 };

const elements = {
    requestPermission: document.getElementById('requestPermission'),
    status: document.getElementById('status'),
    logs: document.getElementById('logs'),
    
    testQuality: document.getElementById('testQuality'),
    startQualityTracking: document.getElementById('startQualityTracking'),
    stopQualityTracking: document.getElementById('stopQualityTracking'),
    qualityDisplay: document.getElementById('qualityDisplay'),
    qualityResult: document.getElementById('qualityResult'),
    
    testMovement: document.getElementById('testMovement'),
    startMovementTracking: document.getElementById('startMovementTracking'),
    stopMovementTracking: document.getElementById('stopMovementTracking'),
    movementTransportMode: document.getElementById('movementTransportMode'),
    movementEnvironment: document.getElementById('movementEnvironment'),
    movementDisplay: document.getElementById('movementDisplay'),
    movementResult: document.getElementById('movementResult'),
    
    startBatchTracking: document.getElementById('startBatchTracking'),
    stopBatchTracking: document.getElementById('stopBatchTracking'),
    batchTransportMode: document.getElementById('batchTransportMode'),
    batchEnvironment: document.getElementById('batchEnvironment'),
    batchInterval: document.getElementById('batchInterval'),
    countdown: document.getElementById('countdown'),
    countdownValue: document.getElementById('countdownValue'),
    batchStats: document.getElementById('batchStats'),
    batchContainer: document.getElementById('batchContainer'),
    totalBatches: document.getElementById('totalBatches'),
    normalBatches: document.getElementById('normalBatches'),
    anomalyBatches: document.getElementById('anomalyBatches'),
    totalDistance: document.getElementById('totalDistance')
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

function showDemo(demoType) {
    document.querySelectorAll('.demo-section').forEach(section => {
        section.classList.remove('active');
    });
    document.querySelectorAll('.tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    document.getElementById(demoType + 'Demo').classList.add('active');
    event.target.classList.add('active');
    
    log(`Switched to ${demoType} demo`);
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

async function testSignalQuality() {
    try {
        showStatus('Testing signal quality...', 'info');
        const location = await collectLocationReading();
        
        const response = await fetch(`${window.location.origin}/api/v1/location/test`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                location: location,
                requestId: `quality-${Date.now()}`,
                metadata: {
                    batteryLevel: (await getBatteryInfo())?.level,
                    connectionType: navigator.connection?.effectiveType
                }
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const result = await response.json();
        displayQualityResult(result);
        log(`Quality test: ${result.data.quality.score}/100 (${result.data.quality.grade})`);
        showStatus('Signal quality analysis complete', 'success');

    } catch (error) {
        log(`Quality test failed: ${error.message}`, 'error');
        showStatus(`Quality test failed: ${error.message}`, 'error');
    }
}

async function testMovementAnalysis() {
    try {
        if (!previousLocation) {
            previousLocation = await collectLocationReading();
            showStatus('First location captured. Move and test again.', 'info');
            log('First location captured for movement analysis');
            return;
        }

        showStatus('Analyzing movement...', 'info');
        const currentLocation = await collectLocationReading();
        const batteryInfo = await getBatteryInfo();

        const response = await fetch(`${window.location.origin}/api/v1/location/analyze-movement`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                previousLocation: previousLocation,
                currentLocation: currentLocation,
                contextHints: {
                    transportMode: elements.movementTransportMode.value,
                    environment: elements.movementEnvironment.value
                },
                deviceInfo: {
                    ...collectDeviceInfo(),
                    batteryLevel: batteryInfo?.level
                },
                requestId: `movement-${Date.now()}`
            })
        });

        if (!response.ok) {
            throw new Error(`API Error: ${response.status}`);
        }

        const result = await response.json();
        displayMovementResult(result);
        
        const status = result.data.accepted ? 'accepted' : 'rejected';
        log(`Movement ${status}: ${result.data.distance}m, ${result.data.impliedSpeed} km/h`);
        showStatus('Movement analysis complete', 'success');
        
        previousLocation = currentLocation;

    } catch (error) {
        log(`Movement analysis failed: ${error.message}`, 'error');
        showStatus(`Movement analysis failed: ${error.message}`, 'error');
    }
}

async function analyzeBatchMovement(fromLocation, toLocation, batchNum) {
    try {
        const batteryInfo = await getBatteryInfo();
        
        const response = await fetch(`${window.location.origin}/api/v1/location/analyze-movement`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                previousLocation: fromLocation,
                currentLocation: toLocation,
                contextHints: {
                    transportMode: elements.batchTransportMode.value,
                    environment: elements.batchEnvironment.value
                },
                deviceInfo: {
                    ...collectDeviceInfo(),
                    batteryLevel: batteryInfo?.level
                },
                requestId: `batch-${batchNum}-${Date.now()}`
            })
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

function displayQualityResult(result) {
    if (!result.success || !result.data) return;

    const { quality, processingTime } = result.data;
    
    const qualityClass = `quality-${quality.grade}`;
    elements.qualityDisplay.innerHTML = `
        <div class="quality-score ${qualityClass}">
            <div>
                <strong>GPS Quality: ${quality.grade.toUpperCase()}</strong>
                <div style="font-size: 14px; margin-top: 4px;">
                    Processing: ${processingTime}ms | Accuracy: ±${Math.round(result.data.processed.accuracy)}m
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
    
    elements.qualityResult.innerHTML = JSON.stringify(result, null, 2);
    elements.qualityResult.style.display = 'block';
}

function displayMovementResult(result) {
    if (!result.success || !result.data) return;

    const analysis = result.data;
    const statusIcon = analysis.accepted ? '✅' : '❌';
    const riskColor = analysis.metadata.riskLevel === 'high' ? '#dc2626' : 
                     analysis.metadata.riskLevel === 'medium' ? '#f59e0b' : '#16a34a';

    elements.movementDisplay.innerHTML = `
        <div style="border: 2px solid ${riskColor}; border-radius: 8px; padding: 16px; margin: 16px 0;">
            <div style="font-size: 18px; font-weight: bold; margin-bottom: 8px;">
                ${statusIcon} Movement Analysis Result
            </div>
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;">
                <div>
                    <strong>Distance:</strong> ${Math.round(analysis.distance)}m<br>
                    <strong>Speed:</strong> ${analysis.impliedSpeed} km/h<br>
                    <strong>Risk:</strong> ${analysis.metadata.riskLevel.toUpperCase()}
                </div>
                <div>
                    <strong>Platform:</strong> ${analysis.platformAnalysis.detectedPlatform}<br>
                    <strong>Signal:</strong> ${analysis.qualityFactors.signalQuality}<br>
                    <strong>Reliability:</strong> ${Math.round(analysis.qualityFactors.overallReliability * 100)}%
                </div>
            </div>
            <div style="margin-top: 12px; padding: 8px; background: rgba(0,0,0,0.05); border-radius: 4px;">
                <strong>Analysis:</strong> ${analysis.reason}
            </div>
        </div>
    `;
    elements.movementDisplay.style.display = 'block';
    
    elements.movementResult.innerHTML = JSON.stringify(result, null, 2);
    elements.movementResult.style.display = 'block';
}

function displayBatchResult(batchNum, fromLocation, toLocation, analysis) {
    if (!analysis) return;

    const classification = classifyBatchResult(analysis);
    const distance = analysis.distance || 0;
    
    totalDistance += distance;
    batchStats.total++;
    batchStats[classification.type]++;
    updateBatchStats();

    const statusIcon = classification.type === 'normal' ? '✅' : 
                      classification.type === 'warning' ? '⚠️' : '❌';
    
    const platformInfo = analysis.platformAnalysis ? 
        `${analysis.platformAnalysis.detectedPlatform.toUpperCase()}` : 'Unknown';
    
    const qualityInfo = analysis.qualityFactors ? 
        `${analysis.qualityFactors.signalQuality} signal, ${Math.round(analysis.qualityFactors.overallReliability * 100)}% reliable` : '';
    
    const riskInfo = analysis.metadata?.riskLevel ? 
        `Risk: ${analysis.metadata.riskLevel.toUpperCase()}` : '';

    const batchElement = document.createElement('div');
    batchElement.className = `batch ${classification.type}`;
    
    batchElement.innerHTML = `
        <div class="batch-header">
            ${statusIcon} Batch #${batchNum} [${new Date().toLocaleTimeString()}]
        </div>
        <div class="batch-details">
            Distance: ${Math.round(distance)}m | Speed: ${analysis.impliedSpeed?.toFixed(1) || 0} km/h | Time: ${analysis.timeElapsed?.toFixed(1) || 0}s
        </div>
        <div class="batch-details">
            Platform: ${platformInfo} | ${qualityInfo} | ${riskInfo}
        </div>
        <div class="batch-details">
            ${classification.reason}
        </div>
    `;
    
    elements.batchContainer.insertBefore(batchElement, elements.batchContainer.firstChild);
    elements.batchContainer.style.display = 'block';
}

function updateBatchStats() {
    elements.totalBatches.textContent = batchStats.total;
    elements.normalBatches.textContent = batchStats.normal;
    elements.anomalyBatches.textContent = batchStats.anomaly + batchStats.warning;
    elements.totalDistance.textContent = Math.round(totalDistance) + 'm';
    elements.batchStats.style.display = 'block';
}

function classifyBatchResult(analysis) {
    if (!analysis) {
        return { type: 'anomaly', reason: 'API analysis failed' };
    }

    const transportMode = elements.batchTransportMode.value;
    const SPEED_LIMITS = {
        walking: 8,
        cycling: 40,
        driving: 120,
        stationary: 0.5,
        unknown: 50
    };

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
            updateBatchStats();
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
        elements.testQuality.disabled = false;
        elements.startQualityTracking.disabled = false;
        elements.testMovement.disabled = false;
        elements.startMovementTracking.disabled = false;
        elements.startBatchTracking.disabled = false;
    } catch (error) {
        log(`Permission error: ${error.message}`);
        showStatus(`Permission error: ${error.message}`, 'error');
    }
});

elements.testQuality.addEventListener('click', testSignalQuality);
elements.testMovement.addEventListener('click', testMovementAnalysis);

elements.startQualityTracking.addEventListener('click', () => {
    log('Starting quality monitoring...');
    showStatus('Starting continuous quality monitoring...', 'info');
    
    qualityTrackingInterval = setInterval(() => {
        testSignalQuality();
    }, 5000);
    
    elements.startQualityTracking.disabled = true;
    elements.stopQualityTracking.disabled = false;
});

elements.stopQualityTracking.addEventListener('click', () => {
    if (qualityTrackingInterval) {
        clearInterval(qualityTrackingInterval);
        qualityTrackingInterval = null;
    }
    
    log('Quality monitoring stopped');
    showStatus('Quality monitoring stopped', 'info');
    
    elements.startQualityTracking.disabled = false;
    elements.stopQualityTracking.disabled = true;
});

elements.startMovementTracking.addEventListener('click', () => {
    log('Starting movement tracking...');
    showStatus('Starting continuous movement tracking...', 'info');
    
    movementTrackingInterval = setInterval(() => {
        testMovementAnalysis();
    }, 8000);
    
    elements.startMovementTracking.disabled = true;
    elements.stopMovementTracking.disabled = false;
});

elements.stopMovementTracking.addEventListener('click', () => {
    if (movementTrackingInterval) {
        clearInterval(movementTrackingInterval);
        movementTrackingInterval = null;
    }
    
    log('Movement tracking stopped');
    showStatus('Movement tracking stopped', 'info');
    
    elements.startMovementTracking.disabled = false;
    elements.stopMovementTracking.disabled = true;
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
    elements.batchTransportMode.disabled = true;
    elements.batchEnvironment.disabled = true;
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
    elements.batchTransportMode.disabled = false;
    elements.batchEnvironment.disabled = false;
    elements.batchInterval.disabled = false;
});

function clearLogs() {
    elements.logs.innerHTML = '<div class="log-entry"><span class="log-timestamp">[Cleared]</span> Log cleared</div>';
}

document.addEventListener('DOMContentLoaded', () => {
    log('GeoGuardian API Demo ready');
    showStatus('Click "Request Location Permission" to begin testing all API endpoints', 'info');
});