const API_BASE = 'https://geoguardian-pa0d.onrender.com/api/v1';

let map;
let currentLocationMarker;
let fusedLocationMarker;
let geofences = [];
let locationHistory = [];
let trackingInterval;
let geofenceStates = [];
let isTracking = false;
let rawLocationCircle;
let fusedLocationCircle;

function initMap() {
    map = L.map('map').setView([37.7749, -122.4194], 15);

    L.tileLayer('data:image/svg+xml;base64,' + btoa(`
                <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256">
                    <defs>
                        <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
                            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="#e2e8f0" stroke-width="1"/>
                        </pattern>
                    </defs>
                    <rect width="256" height="256" fill="#f8fafc"/>
                    <rect width="256" height="256" fill="url(#grid)"/>
                    <text x="128" y="130" text-anchor="middle" font-family="sans-serif" font-size="14" fill="#6b7280">Demo Map</text>
                </svg>
            `), {
        attribution: 'Demo Map - Not Real Location Data'
    }).addTo(map);

    map.on('click', function (e) {
        if (document.getElementById('createGeofence').textContent.includes('Click Map')) {
            createGeofenceAtLocation(e.latlng);
        }
    });

    log('Map initialized and ready');
}

function log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement('div');
    logEntry.className = 'log-entry';
    logEntry.innerHTML = `<span class="log-timestamp">[${timestamp}]</span> ${message}`;
    document.getElementById('logs').appendChild(logEntry);
    document.getElementById('logs').scrollTop = document.getElementById('logs').scrollHeight;
}

function updateStatus(message, type = 'info') {
    const statusEl = document.getElementById('liveStatus');
    statusEl.textContent = message;
    statusEl.className = `status-indicator status-${type}`;
}

function updatePipelineStep(stepId, status) {
    const step = document.getElementById(stepId);
    step.className = `pipeline-step ${status}`;
}

function resetPipeline() {
    ['step1', 'step2', 'step3', 'step4', 'step5'].forEach(id => {
        document.getElementById(id).className = 'pipeline-step';
    });
}

function createGeofenceAtLocation(latlng) {
    const name = document.getElementById('geofenceName').value || 'Geofence';
    const radius = parseInt(document.getElementById('geofenceRadius').value);

    const geofence = {
        id: `geofence-${Date.now()}`,
        name: name,
        center: { latitude: latlng.lat, longitude: latlng.lng },
        radius: radius,
        metadata: {
            type: 'custom',
            priority: 'medium'
        }
    };

    geofences.push(geofence);
    drawGeofence(geofence);

    log(`Created geofence "${name}" with ${radius}m radius`);
    document.getElementById('createGeofence').textContent = '✅ Geofence Created';

    setTimeout(() => {
        document.getElementById('createGeofence').textContent = '📍 Click Map to Create Geofence';
    }, 2000);
}

function drawGeofence(geofence) {
    const center = [geofence.center.latitude, geofence.center.longitude];
    const radius = geofence.radius;

    const strategy = document.getElementById('bufferStrategy').value;
    const bufferMultipliers = {
        conservative: 1.2,
        moderate: 1.5,
        aggressive: 2.0
    };

    const buffer = Math.max(20, 15 * bufferMultipliers[strategy]);
    const innerRadius = Math.max(0, radius - buffer);
    const outerRadius = radius + buffer;

    const outerCircle = L.circle(center, {
        radius: outerRadius,
        fillColor: '#fbbf24',
        color: '#f59e0b',
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.15
    }).addTo(map);

    const outerLabel = L.marker([center[0] + 0.0005, center[1]], {
        icon: L.divIcon({
            className: 'radius-label',
            html: `<div style="background: rgba(251, 191, 36, 0.9); color: #92400e; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; border: 1px solid #f59e0b;">❓ ${outerRadius.toFixed(0)}m</div>`,
            iconSize: [60, 20],
            iconAnchor: [0, 10]
        })
    }).addTo(map);

    const mainCircle = L.circle(center, {
        radius: radius,
        fillColor: '#3b82f6',
        color: '#2563eb',
        weight: 3,
        opacity: 0.9,
        fillOpacity: 0.2
    }).addTo(map);

    const mainLabel = L.marker([center[0] - 0.0003, center[1]], {
        icon: L.divIcon({
            className: 'radius-label',
            html: `<div style="background: rgba(59, 130, 246, 0.9); color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; border: 1px solid #2563eb;">🔄 ${radius}m</div>`,
            iconSize: [50, 20],
            iconAnchor: [0, 10]
        })
    }).addTo(map);

    if (innerRadius > 10) {
        const innerCircle = L.circle(center, {
            radius: innerRadius,
            fillColor: '#10b981',
            color: '#059669',
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.25
        }).addTo(map);

        const innerLabel = L.marker([center[0] + 0.0003, center[1]], {
            icon: L.divIcon({
                className: 'radius-label',
                html: `<div style="background: rgba(16, 185, 129, 0.9); color: white; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: bold; border: 1px solid #059669;">✅ ${innerRadius.toFixed(0)}m</div>`,
                iconSize: [50, 20],
                iconAnchor: [0, 10]
            })
        }).addTo(map);
    }

    const centerMarker = L.marker(center, {
        icon: L.divIcon({
            className: 'geofence-center',
            html: `<div style="background: #3b82f6; color: white; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);">🎯</div>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12]
        })
    }).addTo(map);

    const nameLabel = L.marker([center[0] - 0.0008, center[1]], {
        icon: L.divIcon({
            className: 'geofence-name',
            html: `<div style="background: rgba(255, 255, 255, 0.95); color: #1f2937; padding: 4px 8px; border-radius: 6px; font-size: 12px; font-weight: bold; border: 1px solid #d1d5db; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">${geofence.name}</div>`,
            iconSize: [100, 25],
            iconAnchor: [0, 12]
        })
    }).addTo(map);

    geofence._mapLayers = [outerCircle, mainCircle, centerMarker, outerLabel, mainLabel, nameLabel];
    if (innerRadius > 10) {
        // innerCircle and innerLabel would be added here if we stored them
    }
}

function detectPlatform() {
    const simulateDevice = document.getElementById('simulateDevice').value;
    if (simulateDevice !== 'auto') return simulateDevice;

    const userAgent = navigator.userAgent.toLowerCase();
    if (userAgent.includes('iphone') || userAgent.includes('ipad')) return 'ios';
    if (userAgent.includes('android')) return 'android';
    return 'web';
}

async function getCurrentLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            position => {
                const location = {
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
                resolve(location);
            },
            error => reject(error),
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 2000
            }
        );
    });
}

async function makeAPIRequest(endpoint, method = 'GET', data = null) {
    const url = `${API_BASE}${endpoint}`;

    const options = {
        method,
        headers: {
            'Content-Type': 'application/json',
        }
    };

    if (data) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    return await response.json();
}

function cleanLocationData(location) {
    return {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy,
        timestamp: location.timestamp,
        speed: location.speed,
        heading: location.heading,
        altitude: location.altitude,
        altitudeAccuracy: location.altitudeAccuracy,
        platform: location.platform,
        source: location.source
    };
}

function cleanGeofenceData(geofence) {
    return {
        id: geofence.id,
        name: geofence.name,
        center: {
            latitude: geofence.center.latitude,
            longitude: geofence.center.longitude
        },
        radius: geofence.radius,
        metadata: geofence.metadata
    };
}

async function processLocationPipeline(rawLocation) {
    let processedLocation = { ...rawLocation };
    let results = {
        raw: rawLocation,
        quality: null,
        fusion: null,
        movement: null,
        geofence: null
    };

    try {
        const cleanRawLocation = cleanLocationData(rawLocation);

        updatePipelineStep('step1', 'active');
        updateStatus('Analyzing GPS quality...', 'info');

        const qualityResult = await makeAPIRequest('/location/test', 'POST', {
            location: cleanRawLocation,
            requestId: `quality-${Date.now()}`
        });

        results.quality = qualityResult.data;
        updatePipelineStep('step1', 'complete');
        log(`Quality: ${qualityResult.data.quality.grade} (${qualityResult.data.quality.score}/100)`);

        if (document.getElementById('enableFusion').checked && locationHistory.length > 0) {
            updatePipelineStep('step2', 'active');
            updateStatus('Applying location fusion...', 'info');

            const cleanHistory = locationHistory.slice(-4).map(cleanLocationData);

            const fusionResult = await makeAPIRequest('/fusion/fused', 'POST', {
                currentLocation: cleanRawLocation,
                locationHistory: cleanHistory,
                fusionOptions: {
                    enableWeightedAveraging: true,
                    enableKalmanFilter: document.getElementById('enableKalman').checked,
                    aggressiveness: document.getElementById('bufferStrategy').value
                },
                requestId: `fusion-${Date.now()}`
            });

            if (fusionResult.success) {
                processedLocation = fusionResult.data.fused.location;
                results.fusion = fusionResult.data;
                updatePipelineStep('step2', 'complete');
                log(`Fusion applied: ${fusionResult.data.fusion.appliedCorrections.join(', ')}`);
            } else {
                updatePipelineStep('step2', 'error');
            }
        } else {
            updatePipelineStep('step2', 'complete');
            log('Fusion skipped (disabled or no history)');
        }

        if (document.getElementById('enableMovementAnalysis').checked && locationHistory.length > 0) {
            updatePipelineStep('step3', 'active');
            updateStatus('Analyzing movement...', 'info');

            const lastLocation = cleanLocationData(locationHistory[locationHistory.length - 1]);
            const cleanProcessedLocation = cleanLocationData(processedLocation);

            const movementResult = await makeAPIRequest('/location/analyze-movement', 'POST', {
                previousLocation: lastLocation,
                currentLocation: cleanProcessedLocation,
                contextHints: {
                    transportMode: 'walking',
                    environment: 'urban'
                },
                requestId: `movement-${Date.now()}`
            });

            results.movement = movementResult.data;
            updatePipelineStep('step3', 'complete');
            log(`Movement: ${movementResult.data.accepted ? 'Accepted' : 'Anomaly'} - ${movementResult.data.reason}`);
        } else {
            updatePipelineStep('step3', 'complete');
            log('Movement analysis skipped (disabled or no history)');
        }

        if (geofences.length > 0) {
            updatePipelineStep('step4', 'active');
            updateStatus('Evaluating geofences...', 'info');

            const cleanGeofences = geofences.map(cleanGeofenceData);
            const cleanHistory = locationHistory.slice(-3).map(cleanLocationData);
            const cleanProcessedLocation = cleanLocationData(processedLocation);

            const geofenceResult = await makeAPIRequest('/geofence/evaluate', 'POST', {
                currentLocation: cleanProcessedLocation,
                geofences: cleanGeofences,
                locationHistory: cleanHistory,
                previousStates: geofenceStates,
                options: {
                    enableAutoFusion: false, 
                    bufferStrategy: document.getElementById('bufferStrategy').value,
                    requireHighAccuracy: false
                },
                requestId: `geofence-${Date.now()}`
            });

            if (geofenceResult.success) {
                results.geofence = geofenceResult.data;
                geofenceStates = geofenceResult.data.updatedStates;
                updatePipelineStep('step4', 'complete');
                log(`Geofences evaluated: ${geofenceResult.data.evaluations.length} zones checked`);
                updateGeofenceResults(geofenceResult.data.evaluations);
            } else {
                updatePipelineStep('step4', 'error');
                log(`Geofence evaluation failed: ${geofenceResult.error}`);
            }
        } else {
            updatePipelineStep('step4', 'complete');
            log('No geofences to evaluate');
        }

        updatePipelineStep('step5', 'complete');
        updateStatus('Processing complete!', 'success');

    } catch (error) {
        log(`Pipeline error: ${error.message}`, 'error');
        updateStatus(`Processing failed: ${error.message}`, 'error');
        updatePipelineStep('step5', 'error');
    }

    return { processedLocation, results };
}

function updateGeofenceResults(evaluations) {
    const container = document.getElementById('geofenceResults');
    container.innerHTML = '';

    evaluations.forEach(evaluation => {
        const resultDiv = document.createElement('div');
        resultDiv.className = `result-item result-${evaluation.status}`;

        const statusEmoji = {
            inside: '✅',
            outside: '❌',
            uncertain: '❓',
            approaching: '🔄',
            leaving: '↗️'
        };

        const triggeredText = evaluation.triggered !== 'none' ?
            ` (${evaluation.triggered.toUpperCase()})` : '';

        resultDiv.innerHTML = `
                    <strong>${statusEmoji[evaluation.status]} ${evaluation.status.toUpperCase()}${triggeredText}</strong><br>
                    Geofence: ${evaluation.geofenceId}<br>
                    Distance: ${evaluation.debugInfo.distanceToCenter}m<br>
                    Confidence: ${(evaluation.confidence * 100).toFixed(1)}%<br>
                    Recommendation: ${evaluation.recommendation}
                `;

        container.appendChild(resultDiv);
    });
}

function updateComparisonPanels(rawLocation, processedLocation, results) {
    document.getElementById('rawData').innerHTML = `
                <div>Lat: ${rawLocation.latitude.toFixed(6)}</div>
                <div>Lng: ${rawLocation.longitude.toFixed(6)}</div>
                <div>Accuracy: ±${Math.round(rawLocation.accuracy)}m</div>
                <div>Platform: ${rawLocation.platform}</div>
                ${results.quality ? `<div>Quality: ${results.quality.quality.grade} (${results.quality.quality.score})</div>` : ''}
            `;

    const accuracyImprovement = rawLocation.accuracy - processedLocation.accuracy;
    const improvementText = accuracyImprovement > 0 ?
        `↑ ${accuracyImprovement.toFixed(1)}m better` :
        accuracyImprovement < 0 ?
            `↓ ${Math.abs(accuracyImprovement).toFixed(1)}m worse` :
            '→ No change';

    document.getElementById('processedData').innerHTML = `
                <div>Lat: ${processedLocation.latitude.toFixed(6)}</div>
                <div>Lng: ${processedLocation.longitude.toFixed(6)}</div>
                <div>Accuracy: ±${Math.round(processedLocation.accuracy)}m</div>
                <div>Improvement: ${improvementText}</div>
                ${results.fusion ? `<div>Fusion: ${results.fusion.fusion.appliedCorrections.length} corrections</div>` : ''}
                ${results.movement ? `<div>Movement: ${results.movement.accepted ? '✅' : '❌'}</div>` : ''}
            `;
}

function updateMetrics(location, results) {
    document.getElementById('currentAccuracy').textContent = `±${Math.round(location.accuracy)}`;
    document.getElementById('currentPlatform').textContent = location.platform.toUpperCase();

    if (results.quality) {
        document.getElementById('currentConfidence').textContent = `${results.quality.quality.score}%`;
        document.getElementById('processingTime').textContent = `${results.quality.processingTime}ms`;
    }
}

function updateMapMarkers(rawLocation, processedLocation) {
    const rawLatLng = [rawLocation.latitude, rawLocation.longitude];
    const processedLatLng = [processedLocation.latitude, processedLocation.longitude];

    if (currentLocationMarker) map.removeLayer(currentLocationMarker);
    if (fusedLocationMarker) map.removeLayer(fusedLocationMarker);
    if (rawLocationCircle) map.removeLayer(rawLocationCircle);
    if (fusedLocationCircle) map.removeLayer(fusedLocationCircle);

    rawLocationCircle = L.circle(rawLatLng, {
        radius: rawLocation.accuracy,
        fillColor: '#dc2626',
        color: '#dc2626',
        weight: 2,
        opacity: 0.8,
        fillOpacity: 0.2
    }).addTo(map);

    currentLocationMarker = L.marker(rawLatLng, {
        icon: L.divIcon({
            className: 'location-marker-raw',
            html: `<div style="background: #dc2626; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">📍</div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        })
    }).addTo(map).bindPopup(`Raw GPS<br>±${Math.round(rawLocation.accuracy)}m accuracy`);

    const distance = calculateDistance(rawLocation.latitude, rawLocation.longitude,
        processedLocation.latitude, processedLocation.longitude);

    if (distance > 1) {
        fusedLocationCircle = L.circle(processedLatLng, {
            radius: processedLocation.accuracy,
            fillColor: '#10b981',
            color: '#10b981',
            weight: 2,
            opacity: 0.8,
            fillOpacity: 0.2
        }).addTo(map);

        fusedLocationMarker = L.marker(processedLatLng, {
            icon: L.divIcon({
                className: 'location-marker-fused',
                html: `<div style="background: #10b981; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">✨</div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(map).bindPopup(`Processed Location<br>±${Math.round(processedLocation.accuracy)}m accuracy<br>Moved ${distance.toFixed(1)}m from raw`);

        L.polyline([rawLatLng, processedLatLng], {
            color: '#6b7280',
            weight: 2,
            opacity: 0.7,
            dashArray: '5, 5'
        }).addTo(map);
    }
    map.setView(processedLatLng, map.getZoom());
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; 
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

async function performTracking() {
    try {
        resetPipeline();
        updateStatus('Collecting GPS reading...', 'info');

        const rawLocation = await getCurrentLocation();
        log(`GPS collected: ${rawLocation.latitude.toFixed(6)}, ${rawLocation.longitude.toFixed(6)} (±${Math.round(rawLocation.accuracy)}m)`);

        const { processedLocation, results } = await processLocationPipeline(rawLocation);

        updateMapMarkers(rawLocation, processedLocation);
        updateComparisonPanels(rawLocation, processedLocation, results);
        updateMetrics(processedLocation, results);

        locationHistory.push(processedLocation);
        if (locationHistory.length > 10) {
            locationHistory = locationHistory.slice(-10);
        }

        log(`Processing complete - ${results.geofence ? results.geofence.evaluations.length : 0} geofences evaluated`);

    } catch (error) {
        log(`Tracking error: ${error.message}`, 'error');
        updateStatus(`Error: ${error.message}`, 'error');
        updatePipelineStep('step1', 'error');
    }
}

document.getElementById('requestLocation').addEventListener('click', async () => {
    try {
        updateStatus('Requesting location permission...', 'info');
        await getCurrentLocation();
        updateStatus('Location permission granted!', 'success');
        log('Location permission granted');

        document.getElementById('requestLocation').disabled = true;
        document.getElementById('startDemo').disabled = false;
        document.getElementById('createGeofence').disabled = false;

    } catch (error) {
        updateStatus(`Permission denied: ${error.message}`, 'error');
        log(`Permission error: ${error.message}`, 'error');
    }
});

document.getElementById('startDemo').addEventListener('click', () => {
    if (isTracking) return;

    isTracking = true;
    log('Starting smart tracking demo...');
    updateStatus('Demo started - tracking every 5 seconds', 'success');

    performTracking();

    trackingInterval = setInterval(performTracking, 5000);

    document.getElementById('startDemo').disabled = true;
    document.getElementById('stopDemo').disabled = false;
});

document.getElementById('stopDemo').addEventListener('click', () => {
    if (!isTracking) return;

    isTracking = false;

    if (trackingInterval) {
        clearInterval(trackingInterval);
        trackingInterval = null;
    }

    log('Demo stopped');
    updateStatus('Demo stopped', 'info');
    resetPipeline();

    document.getElementById('startDemo').disabled = false;
    document.getElementById('stopDemo').disabled = true;
});

document.getElementById('clearMap').addEventListener('click', () => {
    map.eachLayer(layer => {
        if (layer !== map._layers[Object.keys(map._layers)[0]]) {
            map.removeLayer(layer);
        }
    });

    geofences = [];
    locationHistory = [];
    geofenceStates = [];
    currentLocationMarker = null;
    fusedLocationMarker = null;
    rawLocationCircle = null;
    fusedLocationCircle = null;

    document.getElementById('geofenceResults').innerHTML = 'No geofences created yet';
    document.getElementById('rawData').innerHTML = 'No data yet';
    document.getElementById('processedData').innerHTML = 'No data yet';
    document.getElementById('currentAccuracy').textContent = '--';
    document.getElementById('currentConfidence').textContent = '--';
    document.getElementById('currentPlatform').textContent = '--';
    document.getElementById('processingTime').textContent = '--';

    log('Map and data cleared');
    updateStatus('Map cleared - ready for new demo', 'info');
});

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    log('Smart Geofencing Demo ready');
    updateStatus('Click "Request Location Access" to begin', 'info');
});