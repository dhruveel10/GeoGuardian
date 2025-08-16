let previousLocation = null;
let locationHistory = [];
let qualityTrackingInterval = null;
let movementTrackingInterval = null;
let batchTrackingInterval = null;
let fusionTrackingInterval = null;
let geofenceMonitoringInterval = null;
let countdownInterval = null;
let batchNumber = 0;
let totalDistance = 0;
let batchStats = { total: 0, normal: 0, warning: 0, anomaly: 0 };
let geofenceCenter = null;
let geofenceState = 'unknown';
let geofenceStateTimestamp = null;

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
    totalDistance: document.getElementById('totalDistance'),
    
    setGeofenceCenter: document.getElementById('setGeofenceCenter'),
    testGeofence: document.getElementById('testGeofence'),
    startGeofenceMonitoring: document.getElementById('startGeofenceMonitoring'),
    stopGeofenceMonitoring: document.getElementById('stopGeofenceMonitoring'),
    geofenceRadius: document.getElementById('geofenceRadius'),
    geofenceBufferMultiplier: document.getElementById('geofenceBufferMultiplier'),
    geofenceGracePeriod: document.getElementById('geofenceGracePeriod'),
    geofenceMultiCheck: document.getElementById('geofenceMultiCheck'),
    geofenceCenter: document.getElementById('geofenceCenter'),
    geofenceCenterCoords: document.getElementById('geofenceCenterCoords'),
    geofenceDisplay: document.getElementById('geofenceDisplay'),
    geofenceResult: document.getElementById('geofenceResult'),
    
    testOptimization: document.getElementById('testOptimization'),
    analyzeContext: document.getElementById('analyzeContext'),
    optimizationMode: document.getElementById('optimizationMode'),
    targetUseCase: document.getElementById('targetUseCase'),
    contextBattery: document.getElementById('contextBattery'),
    contextMovement: document.getElementById('contextMovement'),
    contextEnvironment: document.getElementById('contextEnvironment'),
    contextPriority: document.getElementById('contextPriority'),
    optimizationDisplay: document.getElementById('optimizationDisplay'),
    optimizationResult: document.getElementById('optimizationResult')
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

function getGeofenceOptions() {
    const options = {};
    
    if (elements.geofenceBufferMultiplier.value && elements.geofenceBufferMultiplier.value !== '') {
        options.customBufferMultiplier = parseFloat(elements.geofenceBufferMultiplier.value);
    }
    
    options.requireMultiCheck = elements.geofenceMultiCheck.checked;
    
    const gracePeriod = parseInt(elements.geofenceGracePeriod.value);
    if (!isNaN(gracePeriod) && gracePeriod >= 0) {
        options.exitGracePeriod = gracePeriod;
    }
    
    if (geofenceState && geofenceState !== 'unknown') {
        options.previousState = geofenceState;
        if (geofenceStateTimestamp) {
            options.previousStateTimestamp = geofenceStateTimestamp;
        }
    }
    
    return options;
}

function getOptimizationContext() {
    const context = {
        batteryLevel: parseInt(elements.contextBattery.value),
        appPriority: elements.contextPriority.value
    };
    
    if (elements.contextMovement.value) {
        context.movementPattern = elements.contextMovement.value;
    }
    
    if (elements.contextEnvironment.value) {
        context.environment = elements.contextEnvironment.value;
    }
    
    getBatteryInfo().then(batteryInfo => {
        if (batteryInfo) {
            context.batteryLevel = batteryInfo.level;
            context.isCharging = batteryInfo.charging;
        }
    });
    
    return context;
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

async function setGeofenceCenterToCurrent() {
    try {
        showStatus('Setting geofence center to current location...', 'info');
        const location = await collectLocationReading();
        
        geofenceCenter = {
            latitude: location.latitude,
            longitude: location.longitude
        };
        
        elements.geofenceCenterCoords.textContent = 
            `${geofenceCenter.latitude.toFixed(6)}, ${geofenceCenter.longitude.toFixed(6)}`;
        elements.geofenceCenter.style.display = 'block';
        
        elements.testGeofence.disabled = false;
        elements.startGeofenceMonitoring.disabled = false;
        
        log(`Geofence center set to: ${geofenceCenter.latitude.toFixed(6)}, ${geofenceCenter.longitude.toFixed(6)}`);
        showStatus('Geofence center set successfully!', 'success');
        
    } catch (error) {
        log(`Failed to set geofence center: ${error.message}`, 'error');
        showStatus(`Failed to set geofence center: ${error.message}`, 'error');
    }
}

async function testGeofenceStatus() {
    if (!geofenceCenter) {
        showStatus('Please set geofence center first', 'error');
        return;
    }
    
    try {
        showStatus('Evaluating geofence status...', 'info');
        const location = await collectLocationReading();
        
        const payload = {
            location: {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                timestamp: location.timestamp,
                speed: location.speed,
                heading: location.heading,
                altitude: location.altitude,
                altitudeAccuracy: location.altitudeAccuracy,
                platform: location.platform || 'web',
                source: location.source || 'gps'
            },
            geofence: {
                center: {
                    latitude: geofenceCenter.latitude,
                    longitude: geofenceCenter.longitude
                },
                radius: parseInt(elements.geofenceRadius.value),
                id: 'demo-geofence',
                name: 'Demo Geofence'
            },
            evaluationOptions: getGeofenceOptions(),
            requestId: `geofence-${Date.now()}`
        };

        console.log('Sending geofence payload:', JSON.stringify(payload, null, 2));

        const result = await makeAPIRequest('/api/v1/geofence/evaluate', 'POST', payload);

        displayGeofenceResult(result);
        
        if (result.success && result.data) {
            geofenceState = result.data.status;
            geofenceStateTimestamp = Date.now();
        }
        
        log(`Geofence status: ${result.data?.status} (confidence: ${result.data?.confidence})`);
        showStatus('Geofence evaluation complete', 'success');

    } catch (error) {
        log(`Geofence evaluation failed: ${error.message}`, 'error');
        showStatus(`Geofence evaluation failed: ${error.message}`, 'error');
        console.error('Full error details:', error);
    }
}

async function testPipelineOptimization() {
    try {
        showStatus('Getting optimization recommendations...', 'info');
        const location = await collectLocationReading();
        addToLocationHistory(location);
        
        const result = await makeAPIRequest('/api/v1/adaptive/optimize', 'POST', {
            currentLocation: location,
            locationHistory: locationHistory.slice(-3),
            mode: elements.optimizationMode.value,
            context: getOptimizationContext(),
            targetUseCase: elements.targetUseCase.value,
            requestId: `optimize-${Date.now()}`
        });

        displayOptimizationResult(result);
        log(`Recommended mode: ${result.data?.recommendedMode}`);
        showStatus('Optimization recommendations generated', 'success');

    } catch (error) {
        log(`Optimization failed: ${error.message}`, 'error');
        showStatus(`Optimization failed: ${error.message}`, 'error');
    }
}

async function analyzeCurrentContext() {
    try {
        showStatus('Analyzing current context...', 'info');
        const location = await collectLocationReading();
        
        const result = await makeAPIRequest('/api/v1/adaptive/context-analysis', 'POST', {
            currentLocation: location,
            locationHistory: locationHistory.slice(-3),
            context: getOptimizationContext()
        });

        displayContextAnalysis(result);
        log(`Context analysis: ${result.data?.detectedPatterns?.environment} environment, ${result.data?.detectedPatterns?.movementPattern} movement`);
        showStatus('Context analysis complete', 'success');

    } catch (error) {
        log(`Context analysis failed: ${error.message}`, 'error');
        showStatus(`Context analysis failed: ${error.message}`, 'error');
    }
}

function validateGeofenceInputs() {
    const errors = [];
    
    if (!geofenceCenter) {
        errors.push('Geofence center not set');
    }
    
    const radius = parseInt(elements.geofenceRadius.value);
    if (isNaN(radius) || radius <= 0 || radius > 10000) {
        errors.push('Invalid radius: must be between 1 and 10000 meters');
    }
    
    const gracePeriod = parseInt(elements.geofenceGracePeriod.value);
    if (isNaN(gracePeriod) || gracePeriod < 0) {
        errors.push('Invalid grace period: must be 0 or greater');
    }
    
    if (elements.geofenceBufferMultiplier.value !== '' && elements.geofenceBufferMultiplier.value !== null) {
        const multiplier = parseFloat(elements.geofenceBufferMultiplier.value);
        if (isNaN(multiplier) || multiplier <= 0) {
            errors.push('Invalid buffer multiplier: must be greater than 0');
        }
    }
    
    return errors;
}

async function testGeofenceStatusEnhanced() {
    const validationErrors = validateGeofenceInputs();
    if (validationErrors.length > 0) {
        const errorMsg = `Input validation failed: ${validationErrors.join(', ')}`;
        log(errorMsg, 'error');
        showStatus(errorMsg, 'error');
        return;
    }
    
    try {
        showStatus('Evaluating geofence status...', 'info');
        const location = await collectLocationReading();
        
        const payload = {
            location: {
                latitude: parseFloat(location.latitude),
                longitude: parseFloat(location.longitude),
                accuracy: parseFloat(location.accuracy),
                timestamp: parseInt(location.timestamp),
                speed: location.speed ? parseFloat(location.speed) : null,
                heading: location.heading ? parseFloat(location.heading) : null,
                altitude: location.altitude ? parseFloat(location.altitude) : null,
                altitudeAccuracy: location.altitudeAccuracy ? parseFloat(location.altitudeAccuracy) : null,
                platform: location.platform || 'web',
                source: location.source || 'gps'
            },
            geofence: {
                center: {
                    latitude: parseFloat(geofenceCenter.latitude),
                    longitude: parseFloat(geofenceCenter.longitude)
                },
                radius: parseInt(elements.geofenceRadius.value)
            },
            evaluationOptions: getGeofenceOptions(),
            requestId: `geofence-${Date.now()}`
        };

        log(`Geofence payload: ${JSON.stringify(payload, null, 2)}`);

        const result = await makeAPIRequest('/api/v1/geofence/evaluate', 'POST', payload);

        displayGeofenceResult(result);
        
        if (result.success && result.data) {
            geofenceState = result.data.status;
            geofenceStateTimestamp = Date.now();
        }
        
        log(`Geofence status: ${result.data?.status} (confidence: ${result.data?.confidence})`);
        showStatus('Geofence evaluation complete', 'success');

    } catch (error) {
        log(`Geofence evaluation failed: ${error.message}`, 'error');
        showStatus(`Geofence evaluation failed: ${error.message}`, 'error');
        console.error('Full error details:', error);
    }
}

async function testMinimalGeofence() {
    try {
        const location = await collectLocationReading();
        
        const payload = {
            location: {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracy: location.accuracy,
                timestamp: location.timestamp,
                platform: 'web'
            },
            geofence: {
                center: {
                    latitude: location.latitude,
                    longitude: location.longitude
                },
                radius: 50
            }
        };
        
        log(`Testing minimal geofence payload: ${JSON.stringify(payload, null, 2)}`);
        
        const result = await makeAPIRequest('/api/v1/geofence/evaluate', 'POST', payload);
        
        if (result.success) {
            log('✅ Minimal geofence test successful!', 'success');
            console.log('Response:', result);
        } else {
            log('❌ Minimal geofence test failed', 'error');
            console.error('Response:', result);
        }
        
        return result;
        
    } catch (error) {
        log(`Minimal geofence test error: ${error.message}`, 'error');
        console.error('Full error:', error);
        throw error;
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

function displayGeofenceResult(result) {
    if (!result.success || !result.data) return;

    const data = result.data;
    const statusIcon = getGeofenceStatusIcon(data.status);
    const statusClass = `geofence-${data.status.replace('_', '-')}`;
    
    const needsVerification = data.verification.needsSecondCheck;
    const hasTransition = data.stateTransition && data.stateTransition.isTransition;
    
    elements.geofenceDisplay.innerHTML = `
        <div class="geofence-status ${statusClass}">
            <div class="geofence-header">
                ${statusIcon} Status: ${data.status.toUpperCase().replace('_', ' ')}
                <span class="confidence-badge">Confidence: ${Math.round(data.confidence * 100)}%</span>
            </div>
            
            <div class="geofence-details">
                <div class="detail-row">
                    <strong>Distance from center:</strong> ${data.distance.toFixed(1)}m
                </div>
                <div class="detail-row">
                    <strong>Distance from boundary:</strong> ${data.distanceFromBoundary > 0 ? '+' : ''}${data.distanceFromBoundary.toFixed(1)}m
                </div>
                <div class="detail-row">
                    <strong>Buffer zone:</strong> ±${data.bufferZone.toFixed(1)}m
                </div>
                <div class="detail-row">
                    <strong>Geofence radius:</strong> ${data.geofenceRadius}m
                </div>
            </div>
            
            ${needsVerification ? `
                <div class="verification-alert">
                    <strong>⚠️ Verification Recommended</strong><br>
                    ${data.verification.reason}<br>
                    <small>Suggested delay: ${data.verification.recommendedDelay}ms | Mode: ${data.verification.suggestedAccuracy}</small>
                </div>
            ` : ''}
            
            ${hasTransition ? `
                <div class="transition-info">
                    <strong>🔄 State Transition Detected</strong><br>
                    From: ${data.stateTransition.from} → To: ${data.stateTransition.to}<br>
                    ${data.stateTransition.gracePeriodActive ? 
                        `Grace period active: ${data.stateTransition.gracePeriodRemaining.toFixed(1)}s remaining` : 
                        'No grace period active'
                    }<br>
                    <small>Recommended action: ${data.stateTransition.recommendedAction}</small>
                </div>
            ` : ''}
            
            <div class="quality-assessment">
                <strong>📊 Quality Assessment</strong><br>
                Location quality: ${data.qualityAssessment.locationQuality}<br>
                Suitable for geofencing: ${data.qualityAssessment.suitableForGeofencing ? '✅' : '❌'}<br>
                Recommended min radius: ${data.qualityAssessment.recommendedMinRadius}m<br>
                <small>Factors: ${data.qualityAssessment.confidenceFactors.join(', ')}</small>
            </div>
        </div>
    `;
    
    elements.geofenceDisplay.style.display = 'block';
    elements.geofenceResult.innerHTML = JSON.stringify(result, null, 2);
    elements.geofenceResult.style.display = 'block';
}

function displayOptimizationResult(result) {
    if (!result.success || !result.data) return;

    const data = result.data;
    const batteryImpactClass = `battery-${data.reasoning.expectedBatteryImpact.replace('_', '-')}`;
    
    elements.optimizationDisplay.innerHTML = `
        <div class="optimization-result">
            <div class="optimization-header">
                <strong>🎯 Recommended Mode: ${data.recommendedMode.toUpperCase().replace('_', ' ')}</strong>
                <span class="${batteryImpactClass}">Battery Impact: ${data.reasoning.expectedBatteryImpact.replace('_', ' ')}</span>
            </div>
            
            <div class="strategy-info">
                <strong>Strategy:</strong> ${data.selectedStrategy}<br>
                <strong>Justification:</strong> ${data.reasoning.modeJustification}
            </div>
            
            <div class="key-factors">
                <strong>🔍 Key Factors:</strong>
                <ul>
                    ${data.reasoning.keyFactors.map(factor => `<li>${factor}</li>`).join('')}
                </ul>
            </div>
            
            <div class="optimization-grid">
                <div class="optimization-section">
                    <h4>🔗 Fusion Settings</h4>
                    <div>Aggressiveness: ${data.optimizations.fusion.aggressiveness}</div>
                    <div>Kalman Filter: ${data.optimizations.fusion.enableKalman ? '✅' : '❌'}</div>
                    <div>Weighted Averaging: ${data.optimizations.fusion.enableWeightedAveraging ? '✅' : '❌'}</div>
                    <div>History Size: ${data.optimizations.fusion.historySize}</div>
                </div>
                
                <div class="optimization-section">
                    <h4>📍 Location Settings</h4>
                    <div>Update Frequency: ${data.optimizations.location.updateFrequency}s</div>
                    <div>Accuracy Threshold: ${data.optimizations.location.accuracyThreshold}m</div>
                    <div>High Accuracy: ${data.optimizations.location.requestHighAccuracy ? '✅' : '❌'}</div>
                    <div>Battery Optimized: ${data.optimizations.location.batteryOptimized ? '✅' : '❌'}</div>
                </div>
                
                <div class="optimization-section">
                    <h4>🎯 Geofence Settings</h4>
                    <div>Buffer Zone: ${data.optimizations.geofence.bufferZone}m</div>
                    <div>Multi-Check: ${data.optimizations.geofence.multiCheckEnabled ? '✅' : '❌'}</div>
                    <div>Grace Period: ${data.optimizations.geofence.gracePeriod}s</div>
                    <div>Verification Delay: ${data.optimizations.geofence.verificationDelay}ms</div>
                </div>
                
                <div class="optimization-section">
                    <h4>🏃 Movement Settings</h4>
                    <div>Anomaly Threshold: ${data.optimizations.movement.anomalyThreshold}</div>
                    <div>Drift Tolerance: ${data.optimizations.movement.driftTolerance}m</div>
                    <div>Platform Specific: ${data.optimizations.movement.platformSpecific ? '✅' : '❌'}</div>
                </div>
            </div>
            
            <div class="expectations">
                <strong>📊 Expected Results:</strong><br>
                Accuracy: ~${data.reasoning.expectedAccuracy}m | 
                Latency: ~${data.reasoning.expectedLatency}ms | 
                Battery: ${data.reasoning.expectedBatteryImpact.replace('_', ' ')}<br>
                <small>${data.reasoning.tradeoffAnalysis}</small>
            </div>
            
            <div class="adaptive-recommendations">
                <strong>🔄 Adaptive Recommendations:</strong><br>
                Next evaluation: ${data.adaptiveRecommendations.nextEvaluation}s<br>
                Fallback mode: ${data.adaptiveRecommendations.fallbackMode}<br>
                <small>Triggers: ${data.adaptiveRecommendations.triggerConditions.join(', ')}</small>
            </div>
        </div>
    `;
    
    elements.optimizationDisplay.style.display = 'block';
    elements.optimizationResult.innerHTML = JSON.stringify(result, null, 2);
    elements.optimizationResult.style.display = 'block';
}

function displayContextAnalysis(result) {
    if (!result.success || !result.data) return;

    const data = result.data;
    
    elements.optimizationDisplay.innerHTML = `
        <div class="context-analysis">
            <div class="context-header">
                <strong>📊 Context Analysis Results</strong>
            </div>
            
            <div class="detected-patterns">
                <h4>🔍 Detected Patterns</h4>
                <div>Movement: ${data.detectedPatterns.movementPattern}</div>
                <div>Environment: ${data.detectedPatterns.environment}</div>
                <div>Battery Optimization Potential: ${Math.round(data.detectedPatterns.batteryOptimizationPotential * 100)}%</div>
                <div>Accuracy Requirement: ${data.detectedPatterns.accuracyRequirement}</div>
            </div>
            
            ${data.riskFactors.length > 0 ? `
                <div class="risk-factors">
                    <h4>⚠️ Risk Factors</h4>
                    <ul>
                        ${data.riskFactors.map(risk => `<li>${risk}</li>`).join('')}
                    </ul>
                </div>
            ` : ''}
            
            <div class="recommendations">
                <h4>💡 Recommendations</h4>
                <ul>
                    ${data.recommendations.map(rec => `<li>${rec}</li>`).join('')}
                </ul>
            </div>
        </div>
    `;
    
    elements.optimizationDisplay.style.display = 'block';
    elements.optimizationResult.innerHTML = JSON.stringify(result, null, 2);
    elements.optimizationResult.style.display = 'block';
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

function getGeofenceStatusIcon(status) {
    switch (status) {
        case 'inside': return '✅';
        case 'outside': return '❌';
        case 'boundary_zone': return '⚠️';
        case 'uncertain': return '❓';
        default: return '❓';
    }
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
        elements.setGeofenceCenter.disabled = false;
        elements.testOptimization.disabled = false;
        elements.analyzeContext.disabled = false;
        
    } catch (error) {
        log(`Permission error: ${error.message}`);
        showStatus(`Permission error: ${error.message}`, 'error');
    }
});

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

elements.setGeofenceCenter.addEventListener('click', setGeofenceCenterToCurrent);
elements.testGeofence.addEventListener('click', testGeofenceStatus);

elements.startGeofenceMonitoring.addEventListener('click', () => {
    if (!geofenceCenter) {
        showStatus('Please set geofence center first', 'error');
        return;
    }
    
    log('Starting geofence monitoring...');
    showStatus('Starting continuous geofence monitoring...', 'info');
    
    geofenceMonitoringInterval = setInterval(() => {
        testGeofenceStatus();
    }, 10000);
    
    elements.startGeofenceMonitoring.disabled = true;
    elements.stopGeofenceMonitoring.disabled = false;
});

elements.stopGeofenceMonitoring.addEventListener('click', () => {
    if (geofenceMonitoringInterval) {
        clearInterval(geofenceMonitoringInterval);
        geofenceMonitoringInterval = null;
    }
    
    log('Geofence monitoring stopped');
    showStatus('Geofence monitoring stopped', 'info');
    
    elements.startGeofenceMonitoring.disabled = false;
    elements.stopGeofenceMonitoring.disabled = true;
});

elements.testOptimization.addEventListener('click', testPipelineOptimization);
elements.analyzeContext.addEventListener('click', analyzeCurrentContext);

document.addEventListener('DOMContentLoaded', () => {
    log('GeoGuardian API Demo ready');
    testBackendConnection();
});