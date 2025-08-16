let previousLocation = null;
let locationHistory = [];
let qualityTrackingInterval = null;
let movementTrackingInterval = null;
let batchTrackingInterval = null;
let fusionTrackingInterval = null;
let countdownInterval = null;
let batchNumber = 0;
let totalDistance = 0;
let batchStats = { total: 0, normal: 0, warning: 0, anomaly: 0 };

const API_CONFIG = {
    BASE_URL: 'https://geoguardian-pa0d.onrender.com',
};

const elements = {
    requestPermission: document.getElementById('requestPermission'),
    status: document.getElementById('status'),
    logs: document.getElementById('logs'),
    
    testQuality: document.getElementById('testQuality'),
    startQualityTracking: document.getElementById('startQualityTracking'),
    stopQualityTracking: document.getElementById('stopQualityTracking'),
    qualityDisplay: document.getElementById('qualityDisplay'),
    qualityResult: document.getElementById('qualityResult'),
    
    testFusion: document.getElementById('testFusion'),
    testComparison: document.getElementById('testComparison'),
    startFusionTracking: document.getElementById('startFusionTracking'),
    stopFusionTracking: document.getElementById('stopFusionTracking'),
    fusionWeightedAveraging: document.getElementById('fusionWeightedAveraging'),
    fusionKalmanFilter: document.getElementById('fusionKalmanFilter'),
    fusionAggressiveness: document.getElementById('fusionAggressiveness'),
    fusionDisplay: document.getElementById('fusionDisplay'),
    fusionResult: document.getElementById('fusionResult'),
    
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

async function makeAPIRequest(endpoint, method = 'GET', data = null) {
    const url = `${API_CONFIG.BASE_URL}${endpoint}`;
    
    try {
        const options = {
            method,
            headers: {
                'Content-Type': 'application/json',
            }
        };
        
        if (data) {
            options.body = JSON.stringify(data);
        }
        
        log(`Making ${method} request to: ${url}`);
        const response = await fetch(url, options);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} - ${response.statusText}`);
        }
        
        return await response.json();
    } catch (error) {
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            throw new Error(`Network error: Cannot connect to ${url}. Check if the backend is running and the URL is correct.`);
        }
        throw error;
    }
}

function addToLocationHistory(location) {
    locationHistory.push(location);
    if (locationHistory.length > 5) {
        locationHistory = locationHistory.slice(-5);
    }
}

function getFusionOptions() {
    return {
        enableWeightedAveraging: elements.fusionWeightedAveraging.checked,
        enableKalmanFilter: elements.fusionKalmanFilter.checked,
        aggressiveness: elements.fusionAggressiveness.value,
        maxHistoryAge: 300000
    };
}

async function testSignalQuality() {
    try {
        showStatus('Testing signal quality...', 'info');
        const location = await collectLocationReading();
        
        const result = await makeAPIRequest('/api/v1/location/test', 'POST', {
            location: location,
            requestId: `quality-${Date.now()}`,
            metadata: {
                batteryLevel: (await getBatteryInfo())?.level,
                connectionType: navigator.connection?.effectiveType
            }
        });

        displayQualityResult(result);
        log(`Quality test: ${result.data.quality.score}/100 (${result.data.quality.grade})`);
        showStatus('Signal quality analysis complete', 'success');

    } catch (error) {
        log(`Quality test failed: ${error.message}`, 'error');
        showStatus(`Quality test failed: ${error.message}`, 'error');
    }
}

async function testLocationFusion() {
    try {
        showStatus('Testing location fusion...', 'info');
        const currentLocation = await collectLocationReading();
        addToLocationHistory(currentLocation);
        
        if (locationHistory.length < 2) {
            showStatus('Need more location history. Move around and try again.', 'info');
            log('Insufficient location history for fusion - need at least 2 readings');
            return;
        }

        const result = await makeAPIRequest('/api/v1/fusion/fused', 'POST', {
            currentLocation: currentLocation,
            locationHistory: locationHistory.slice(0, -1),
            fusionOptions: getFusionOptions(),
            requestId: `fusion-${Date.now()}`
        });

        displayFusionResult(result);
        log(`Fusion applied: ${result.data.fusion.appliedCorrections.join(', ')}`);
        showStatus('Location fusion complete', 'success');

    } catch (error) {
        log(`Fusion test failed: ${error.message}`, 'error');
        showStatus(`Fusion test failed: ${error.message}`, 'error');
    }
}

async function testFusionComparison() {
    try {
        showStatus('Comparing raw vs fused locations...', 'info');
        const currentLocation = await collectLocationReading();
        addToLocationHistory(currentLocation);
        
        if (locationHistory.length < 2) {
            showStatus('Need more location history. Move around and try again.', 'info');
            log('Insufficient location history for comparison - need at least 2 readings');
            return;
        }

        const result = await makeAPIRequest('/api/v1/fusion/compare', 'POST', {
            currentLocation: currentLocation,
            locationHistory: locationHistory.slice(0, -1),
            fusionOptions: getFusionOptions(),
            requestId: `compare-${Date.now()}`
        });

        displayComparisonResult(result);
        log(`Comparison: ${result.data.improvements.accuracyGain.toFixed(1)}m accuracy improvement`);
        showStatus('Fusion comparison complete', 'success');

    } catch (error) {
        log(`Comparison failed: ${error.message}`, 'error');
        showStatus(`Comparison failed: ${error.message}`, 'error');
    }
}

async function analyzeBatchMovement(fromLocation, toLocation, batchNum) {
    try {
        const batteryInfo = await getBatteryInfo();
        
        const result = await makeAPIRequest('/api/v1/location/analyze-movement', 'POST', {
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
        });

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

function displayFusionResult(result) {
    if (!result.success || !result.data) return;

    const { original, fused, fusion, comparison } = result.data;
    
    const accuracyImprovement = comparison.accuracyImprovement;
    const improvementClass = accuracyImprovement > 0 ? 'improvement-positive' : 
                           accuracyImprovement < 0 ? 'improvement-negative' : 'improvement-neutral';
    
    elements.fusionDisplay.innerHTML = `
        <div class="fusion-comparison">
            <div class="fusion-side raw">
                <h4>📍 Raw Location</h4>
                <div><strong>Accuracy:</strong> ±${Math.round(original.location.accuracy)}m</div>
                <div><strong>Quality:</strong> ${original.quality.grade}</div>
                <div><strong>Score:</strong> ${original.quality.score}/100</div>
                <div><strong>Position:</strong> ${original.location.latitude.toFixed(6)}, ${original.location.longitude.toFixed(6)}</div>
            </div>
            <div class="fusion-side fused">
                <h4>🔗 Fused Location</h4>
                <div><strong>Accuracy:</strong> ±${Math.round(fused.location.accuracy)}m 
                    <span class="${improvementClass}">
                        ${accuracyImprovement > 0 ? '↑' : accuracyImprovement < 0 ? '↓' : '→'}${Math.abs(accuracyImprovement).toFixed(1)}m
                    </span>
                </div>
                <div><strong>Quality:</strong> ${fused.quality.grade}</div>
                <div><strong>Score:</strong> ${fused.quality.score}/100</div>
                <div><strong>Position:</strong> ${fused.location.latitude.toFixed(6)}, ${fused.location.longitude.toFixed(6)}</div>
            </div>
        </div>
        
        <div class="fusion-corrections">
            <strong>Applied Corrections:</strong>
            <ul>
                ${fusion.appliedCorrections.map(correction => `<li>${correction}</li>`).join('')}
            </ul>
        </div>
        
        <div class="fusion-metadata">
            <strong>Fusion Details:</strong><br>
            Algorithm: ${fusion.metadata.algorithmUsed}<br>
            Locations Used: ${fusion.metadata.locationsUsed}<br>
            Distance Shift: ${comparison.distanceShift.toFixed(1)}m<br>
            Confidence Improvement: +${fusion.confidenceImprovement.toFixed(2)}<br>
            Processing Time: ${comparison.processingTime}ms
        </div>
    `;
    elements.fusionDisplay.style.display = 'block';
    
    elements.fusionResult.innerHTML = JSON.stringify(result, null, 2);
    elements.fusionResult.style.display = 'block';
}

function displayComparisonResult(result) {
    if (!result.success || !result.data) return;

    const { raw, fused, improvements, visualComparison } = result.data;
    
    elements.fusionDisplay.innerHTML = `
        <div class="fusion-comparison">
            <div class="fusion-side raw">
                <h4>📍 Raw Analysis</h4>
                <div><strong>Accuracy:</strong> ±${Math.round(raw.location.accuracy)}m</div>
                <div><strong>Quality Score:</strong> ${raw.quality.score}/100</div>
                <div><strong>Grade:</strong> ${raw.quality.grade}</div>
                <div><strong>Issues:</strong> ${raw.quality.issues.length}</div>
                <div><strong>Recommendations:</strong> ${raw.quality.recommendations.length}</div>
            </div>
            <div class="fusion-side fused">
                <h4>🔗 Fused Analysis</h4>
                <div><strong>Accuracy:</strong> ±${Math.round(fused.location.accuracy)}m</div>
                <div><strong>Quality Score:</strong> ${fused.quality.score}/100</div>
                <div><strong>Grade:</strong> ${fused.quality.grade}</div>
                <div><strong>Issues:</strong> ${fused.quality.issues.length}</div>
                <div><strong>Recommendations:</strong> ${fused.quality.recommendations.length}</div>
            </div>
        </div>
        
        <div class="fusion-metadata">
            <strong>Improvements:</strong><br>
            Accuracy Gain: <span class="${improvements.accuracyGain > 0 ? 'improvement-positive' : 'improvement-neutral'}">${improvements.accuracyGain.toFixed(1)}m</span><br>
            Quality Score Gain: <span class="${improvements.qualityScoreGain > 0 ? 'improvement-positive' : 'improvement-neutral'}">${improvements.qualityScoreGain.toFixed(1)} points</span><br>
            Confidence Gain: <span class="${improvements.confidenceGain > 0 ? 'improvement-positive' : 'improvement-neutral'}">${improvements.confidenceGain.toFixed(2)}</span><br>
            Recommendations Reduced: <span class="${improvements.recommendationsReduced > 0 ? 'improvement-positive' : 'improvement-neutral'}">${improvements.recommendationsReduced}</span>
        </div>
        
        <div class="fusion-corrections">
            <strong>Platform Optimizations:</strong>
            <ul>
                ${visualComparison.platformOptimizations.map(opt => `<li>${opt}</li>`).join('')}
            </ul>
        </div>
    `;
    elements.fusionDisplay.style.display = 'block';
    
    elements.fusionResult.innerHTML = JSON.stringify(result, null, 2);
    elements.fusionResult.style.display = 'block';
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

async function testBackendConnection() {
    try {
        log('Testing backend connection...');
        const result = await makeAPIRequest('/health');
        if (result.status === 'OK') {
            log(`✅ Backend connected: ${result.service} v${result.version}`);
            showStatus('Backend connection successful! Ready to test location services.', 'success');
        }
    } catch (error) {
        log(`❌ Backend connection failed: ${error.message}`, 'error');
        showStatus(`Backend connection failed: ${error.message}. Please check your API_CONFIG.BASE_URL`, 'error');
    }
}

function clearLogs() {
    elements.logs.innerHTML = '<div class="log-entry"><span class="log-timestamp">[Cleared]</span> Log cleared</div>';
}

// Event Listeners
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
        elements.testFusion.disabled = false;
        elements.testComparison.disabled = false;
        elements.startFusionTracking.disabled = false;
        elements.startBatchTracking.disabled = false;
    } catch (error) {
        log(`Permission error: ${error.message}`);
        showStatus(`Permission error: ${error.message}`, 'error');
    }
});

// Quality tracking
elements.testQuality.addEventListener('click', testSignalQuality);

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

// Fusion tracking
elements.testFusion.addEventListener('click', testLocationFusion);
elements.testComparison.addEventListener('click', testFusionComparison);

elements.startFusionTracking.addEventListener('click', () => {
    log('Starting fusion monitoring...');
    showStatus('Starting continuous fusion monitoring...', 'info');
    
    fusionTrackingInterval = setInterval(() => {
        testFusionComparison();
    }, 8000);
    
    elements.startFusionTracking.disabled = true;
    elements.stopFusionTracking.disabled = false;
});

elements.stopFusionTracking.addEventListener('click', () => {
    if (fusionTrackingInterval) {
        clearInterval(fusionTrackingInterval);
        fusionTrackingInterval = null;
    }
    
    log('Fusion monitoring stopped');
    showStatus('Fusion monitoring stopped', 'info');
    
    elements.startFusionTracking.disabled = false;
    elements.stopFusionTracking.disabled = true;
});

// Batch tracking
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

document.addEventListener('DOMContentLoaded', () => {
    log('GeoGuardian API Demo ready');
    testBackendConnection();
});
