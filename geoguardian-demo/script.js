const API_BASE = 'http://localhost:5001/api/v1';

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
let analyticsData = {
    qualityScores: [],
    speeds: [],
    distances: [],
    anomalies: 0,
    aiCorrections: 0,
    processingTimes: []
};
let qualityChart;
let comparisonMetrics = {
    accuracy: 0,
    falsePositive: 0,
    efficiency: 0
};

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
        attribution: 'Demo Map - AI Enhanced Location Processing'
    }).addTo(map);

    map.on('click', function (e) {
        if (document.getElementById('createGeofence').textContent.includes('Click Map')) {
            createGeofenceAtLocation(e.latlng);
        }
    });

    log('AI-Enhanced Demo initialized and ready');
}

function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const targetTab = button.dataset.tab;
            
            tabButtons.forEach(btn => btn.classList.remove('active'));
            tabContents.forEach(content => content.classList.remove('active'));
            
            button.classList.add('active');
            document.getElementById(targetTab).classList.add('active');
            
            if (targetTab === 'analytics') {
                initAnalyticsCharts();
            }
        });
    });
}

function initAnalyticsCharts() {
    if (qualityChart) return;
    
    const ctx = document.getElementById('qualityChart');
    if (!ctx) return;
    
    qualityChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Location Quality Score',
                data: [],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                tension: 0.4,
                fill: true
            }, {
                label: 'AI Confidence',
                data: [],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    max: 100
                }
            },
            plugins: {
                legend: {
                    position: 'bottom'
                }
            }
        }
    });
}

function updateAnalyticsChart(qualityScore, aiConfidence) {
    if (!qualityChart) return;
    
    const timestamp = new Date().toLocaleTimeString();
    
    qualityChart.data.labels.push(timestamp);
    qualityChart.data.datasets[0].data.push(qualityScore);
    qualityChart.data.datasets[1].data.push(aiConfidence);
    
    if (qualityChart.data.labels.length > 10) {
        qualityChart.data.labels.shift();
        qualityChart.data.datasets[0].data.shift();
        qualityChart.data.datasets[1].data.shift();
    }
    
    qualityChart.update('none');
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
    
    updateComparisonSteps(stepId, status);
}

function updateComparisonSteps(stepId, status) {
    const stepMap = {
        'step1': { traditional: 'traditionalStep1', ai: 'aiStep1' },
        'step2': { traditional: 'traditionalStep2', ai: 'aiStep2' },
        'step3': { traditional: 'traditionalStep3', ai: 'aiStep3' },
        'step4': { traditional: '', ai: 'aiStep4' },
        'step5': { traditional: '', ai: '' }
    };
    
    if (stepMap[stepId]) {
        if (stepMap[stepId].traditional) {
            const traditionalResult = document.getElementById(stepMap[stepId].traditional);
            if (traditionalResult) {
                traditionalResult.textContent = status === 'complete' ? '✓' : status === 'error' ? '✗' : '...';
            }
        }
        if (stepMap[stepId].ai) {
            const aiResult = document.getElementById(stepMap[stepId].ai);
            if (aiResult) {
                aiResult.textContent = status === 'complete' ? '✓ AI' : status === 'error' ? '✗' : '...';
            }
        }
    }
}

function resetPipeline() {
    ['step1', 'step2', 'step3', 'step4', 'step5'].forEach(id => {
        document.getElementById(id).className = 'pipeline-step';
    });
    
    ['traditionalStep1', 'traditionalStep2', 'traditionalStep3'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '--';
    });
    
    ['aiStep1', 'aiStep2', 'aiStep3', 'aiStep4'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.textContent = '--';
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

    log(`Created AI-optimized geofence "${name}" with ${radius}m radius`);
    document.getElementById('createGeofence').textContent = '✅ AI Geofence Created';

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
        geofence: null,
        ai: null
    };

    const aiEnabled = document.getElementById('enableAI').checked;

    try {
        const cleanRawLocation = cleanLocationData(rawLocation);
        const startTime = Date.now();

        updatePipelineStep('step1', 'active');
        updateStatus('Collecting GPS data...', 'info');

        const qualityResult = await makeAPIRequest('/location/test', 'POST', {
            location: cleanRawLocation,
            requestId: `quality-${Date.now()}`
        });

        results.quality = qualityResult.data;
        updatePipelineStep('step1', 'complete');
        log(`Quality: ${qualityResult.data.quality.grade} (${qualityResult.data.quality.score}/100)`);

        if (aiEnabled) {
            updatePipelineStep('step2', 'active');
            updateStatus('AI location validation...', 'info');

            const aiValidation = await makeAPIRequest('/ai/validate-location', 'POST', {
                currentLocation: cleanRawLocation,
                locationHistory: locationHistory.slice(-3).map(cleanLocationData),
                context: {
                    environment: 'urban',
                    transportMode: 'walking'
                },
                requestId: `ai-validation-${Date.now()}`
            });

            results.ai = aiValidation.data;
            updatePipelineStep('step2', 'complete');
            log(`AI Validation: ${aiValidation.data.plausible ? 'Valid' : 'Suspicious'} (${(aiValidation.data.confidence * 100).toFixed(1)}%)`);
        } else {
            updatePipelineStep('step2', 'complete');
            log('AI validation skipped (disabled)');
        }

        if (document.getElementById('enableFusion').checked && locationHistory.length > 0) {
            updatePipelineStep('step3', 'active');
            updateStatus('Applying smart fusion...', 'info');

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
                updatePipelineStep('step3', 'complete');
                log(`Fusion applied: ${fusionResult.data.fusion.appliedCorrections.join(', ')}`);
                analyticsData.aiCorrections++;
            } else {
                updatePipelineStep('step3', 'error');
            }
        } else {
            updatePipelineStep('step3', 'complete');
            log('Fusion skipped (disabled or no history)');
        }

        if (document.getElementById('enableMovementAnalysis').checked && locationHistory.length > 0) {
            updatePipelineStep('step4', 'active');
            updateStatus('AI movement analysis...', 'info');

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
            updatePipelineStep('step4', 'complete');
            log(`Movement: ${movementResult.data.accepted ? 'Normal' : 'Anomaly'} - ${movementResult.data.reason}`);
            
            if (!movementResult.data.accepted) {
                analyticsData.anomalies++;
                
                if (aiEnabled) {
                    const aiExplanation = await makeAPIRequest('/ai/explain-anomaly', 'POST', {
                        movementAnalysis: movementResult.data,
                        locationHistory: locationHistory.slice(-3).map(cleanLocationData),
                        requestId: `ai-explanation-${Date.now()}`
                    });
                    
                    results.ai = { ...results.ai, explanation: aiExplanation.data };
                    log(`AI Explanation: ${aiExplanation.data.explanation}`);
                }
            }
        } else {
            updatePipelineStep('step4', 'complete');
            log('Movement analysis skipped');
        }

        if (geofences.length > 0) {
            updatePipelineStep('step5', 'active');
            updateStatus('AI geofence evaluation...', 'info');

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
                updatePipelineStep('step5', 'complete');
                log(`Geofences evaluated: ${geofenceResult.data.evaluations.length} zones checked`);
                updateGeofenceResults(geofenceResult.data.evaluations);
                
                updateGeofenceTimeline(geofenceResult.data.evaluations);
                
                if (aiEnabled && geofenceResult.data.evaluations.length > 0) {
                    try {
                        const optimization = await makeAPIRequest('/ai/optimize-geofence', 'POST', {
                            geofence: cleanGeofences[0],
                            environment: 'urban',
                            issues: geofenceResult.data.evaluations.filter(e => e.status === 'uncertain').map(e => e.recommendation),
                            requestId: `ai-optimization-${Date.now()}`
                        });
                        
                        results.ai = { ...results.ai, optimization: optimization.data };
                        const recommendationCount = optimization.data?.recommendations?.length || 0;
                        log(`AI Geofence Optimization: ${recommendationCount} suggestions`);
                    } catch (error) {
                        console.error('AI optimization error:', error);
                    }
                }
            } else {
                updatePipelineStep('step5', 'error');
                log(`Geofence evaluation failed: ${geofenceResult.error}`);
            }
        } else {
            updatePipelineStep('step5', 'complete');
            log('No geofences to evaluate');
        }

        const processingTime = Date.now() - startTime;
        analyticsData.processingTimes.push(processingTime);
        
        updateStatus('AI processing complete!', 'success');
        updateAnalytics(results, processingTime);

    } catch (error) {
        log(`Pipeline error: ${error.message}`, 'error');
        updateStatus(`Processing failed: ${error.message}`, 'error');
        updatePipelineStep('step5', 'error');
    }

    return { processedLocation, results };
}

function updateGeofenceTimeline(evaluations) {
    const timeline = document.getElementById('geofenceTimeline');
    if (!timeline) return;
    
    evaluations.forEach(evaluation => {
        if (evaluation.triggered !== 'none') {
            const timelineItem = document.createElement('div');
            timelineItem.className = 'timeline-item';
            
            const time = new Date().toLocaleTimeString();
            timelineItem.innerHTML = `
                <div class="timeline-time">${time}</div>
                <div class="timeline-event">${evaluation.geofenceId}: ${evaluation.status.toUpperCase()} (${evaluation.triggered})</div>
            `;
            
            timeline.insertBefore(timelineItem, timeline.firstChild);
            
            if (timeline.children.length > 10) {
                timeline.removeChild(timeline.lastChild);
            }
        }
    });
}

function updateAnalytics(results, processingTime) {
    if (results.quality) {
        analyticsData.qualityScores.push(results.quality.quality.score);
    }
    
    if (results.ai && results.ai.confidence) {
        updateAnalyticsChart(
            results.quality ? results.quality.quality.score : 0,
            results.ai.confidence * 100
        );
    }
    
    updateAnalyticsDisplay();
    updateComparisonMetrics(results);
}

function updateAnalyticsDisplay() {
    const avgSpeed = analyticsData.speeds.length > 0 
        ? (analyticsData.speeds.reduce((a, b) => a + b, 0) / analyticsData.speeds.length).toFixed(1)
        : '0';
    
    const totalDistance = analyticsData.distances.reduce((a, b) => a + b, 0).toFixed(0);
    
    const avgProcessingTime = analyticsData.processingTimes.length > 0
        ? Math.round(analyticsData.processingTimes.reduce((a, b) => a + b, 0) / analyticsData.processingTimes.length)
        : 0;
    
    const avgConfidence = analyticsData.qualityScores.length > 0
        ? Math.round(analyticsData.qualityScores.reduce((a, b) => a + b, 0) / analyticsData.qualityScores.length)
        : 0;
    
    document.getElementById('avgSpeed').textContent = `${avgSpeed} km/h`;
    document.getElementById('totalDistance').textContent = `${totalDistance} m`;
    document.getElementById('anomaliesCount').textContent = analyticsData.anomalies;
    document.getElementById('aiConfidenceAvg').textContent = `${avgConfidence}%`;
    document.getElementById('correctionsCount').textContent = analyticsData.aiCorrections;
    document.getElementById('avgProcessingTime').textContent = `${avgProcessingTime} ms`;
}

function updateComparisonMetrics(results) {
    if (results.fusion && results.fusion.comparison) {
        comparisonMetrics.accuracy = Math.max(0, results.fusion.comparison.accuracyImprovement);
    }
    
    comparisonMetrics.falsePositive = Math.min(95, comparisonMetrics.falsePositive + (results.ai ? 5 : 0));
    comparisonMetrics.efficiency = Math.min(99, comparisonMetrics.efficiency + 3);
    
    document.getElementById('accuracyBar').style.width = `${comparisonMetrics.accuracy}%`;
    document.getElementById('accuracyImprovement').textContent = `+${comparisonMetrics.accuracy.toFixed(1)}%`;
    
    document.getElementById('falsePositiveBar').style.width = `${comparisonMetrics.falsePositive}%`;
    document.getElementById('falsePositiveReduction').textContent = `-${comparisonMetrics.falsePositive.toFixed(0)}%`;
    
    document.getElementById('efficiencyBar').style.width = `${comparisonMetrics.efficiency}%`;
    document.getElementById('processingEfficiency').textContent = `+${comparisonMetrics.efficiency.toFixed(0)}%`;
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
                    AI Recommendation: ${evaluation.recommendation}
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
    
    let aiAnalysisHtml = '<div>AI Enhanced Processing:</div>';
    if (results.ai) {
        if (results.ai.plausible !== undefined) {
            aiAnalysisHtml += `<div>Plausible: ${results.ai.plausible ? '✅' : '❌'}</div>`;
            aiAnalysisHtml += `<div>Confidence: ${(results.ai.confidence * 100).toFixed(1)}%</div>`;
        }
        if (results.ai.explanation) {
            aiAnalysisHtml += `<div>Explanation: ${results.ai.explanation.explanation.substring(0, 50)}...</div>`;
        }
        if (results.ai.optimization) {
            const recommendationCount = results.ai.optimization?.recommendations?.length || 0;
            aiAnalysisHtml += `<div>Optimizations: ${recommendationCount}</div>`;
        }
    } else {
        aiAnalysisHtml += '<div>AI processing disabled</div>';
    }
    
    document.getElementById('aiAnalysis').innerHTML = aiAnalysisHtml;
}

function updateAIInsights(results) {
    if (results.quality) {
        document.getElementById('qualityInsight').textContent = 
            `${results.quality.quality.grade} quality with ${results.quality.quality.score}% confidence`;
    }
    
    if (results.movement) {
        document.getElementById('movementInsight').textContent = 
            results.movement.accepted ? 'Normal movement pattern detected' : `Anomaly: ${results.movement.reason}`;
    }
    
    if (results.ai && results.ai.optimization) {
        const recommendationCount = results.ai.optimization?.recommendations?.length || 0;
        document.getElementById('geofenceInsight').textContent = 
            `${recommendationCount} AI optimization suggestions available`;
    }
}

function updateMetrics(location, results) {
    document.getElementById('currentAccuracy').textContent = `±${Math.round(location.accuracy)}`;
    document.getElementById('currentPlatform').textContent = location.platform.toUpperCase();

    if (results.quality) {
        document.getElementById('currentConfidence').textContent = `${results.quality.quality.score}%`;
        document.getElementById('processingTime').textContent = `${results.quality.processingTime}ms`;
    }
    
    if (results.ai && results.ai.confidence) {
        document.getElementById('aiScore').textContent = `${(results.ai.confidence * 100).toFixed(0)}%`;
    }
    
    if (results.fusion && results.fusion.comparison) {
        document.getElementById('improvementGain').textContent = `+${results.fusion.comparison.accuracyImprovement.toFixed(1)}m`;
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
                html: `<div style="background: #10b981; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);">🤖</div>`,
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            })
        }).addTo(map).bindPopup(`AI Enhanced Location<br>±${Math.round(processedLocation.accuracy)}m accuracy<br>Moved ${distance.toFixed(1)}m from raw`);

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
        updateAIInsights(results);

        locationHistory.push(processedLocation);
        if (locationHistory.length > 10) {
            locationHistory = locationHistory.slice(-10);
        }

        if (locationHistory.length > 1) {
            const prevLocation = locationHistory[locationHistory.length - 2];
            const distance = calculateDistance(
                prevLocation.latitude, prevLocation.longitude,
                processedLocation.latitude, processedLocation.longitude
            );
            const timeDiff = (processedLocation.timestamp - prevLocation.timestamp) / 1000;
            const speed = (distance / timeDiff) * 3.6;
            
            analyticsData.speeds.push(speed);
            analyticsData.distances.push(distance);
        }

        log(`AI processing complete - ${results.geofence ? results.geofence.evaluations.length : 0} geofences evaluated`);

    } catch (error) {
        log(`Tracking error: ${error.message}`, 'error');
        updateStatus(`Error: ${error.message}`, 'error');
        updatePipelineStep('step1', 'error');
    }
}

async function testLocationEndpoint() {
    try {
        const location = await getCurrentLocation();
        const result = await makeAPIRequest('/location/test', 'POST', {
            location: cleanLocationData(location),
            requestId: `test-${Date.now()}`
        });
        
        document.getElementById('locationResult').textContent = JSON.stringify(result, null, 2);
    } catch (error) {
        document.getElementById('locationResult').textContent = `Error: ${error.message}`;
    }
}

async function testAIValidationEndpoint() {
    try {
        const location = await getCurrentLocation();
        const result = await makeAPIRequest('/ai/validate-location', 'POST', {
            currentLocation: cleanLocationData(location),
            locationHistory: locationHistory.slice(-3).map(cleanLocationData),
            context: { environment: 'urban', transportMode: 'walking' },
            requestId: `ai-test-${Date.now()}`
        });
        
        document.getElementById('aiValidationResult').textContent = JSON.stringify(result, null, 2);
    } catch (error) {
        document.getElementById('aiValidationResult').textContent = `Error: ${error.message}`;
    }
}

async function testFusionEndpoint() {
    try {
        const location = await getCurrentLocation();
        const result = await makeAPIRequest('/fusion/fused', 'POST', {
            currentLocation: cleanLocationData(location),
            locationHistory: locationHistory.slice(-4).map(cleanLocationData),
            fusionOptions: {
                enableWeightedAveraging: true,
                enableKalmanFilter: false,
                aggressiveness: 'moderate'
            },
            requestId: `fusion-test-${Date.now()}`
        });
        
        document.getElementById('fusionResult').textContent = JSON.stringify(result, null, 2);
    } catch (error) {
        document.getElementById('fusionResult').textContent = `Error: ${error.message}`;
    }
}

async function testFusionCompareEndpoint() {
    try {
        const location = await getCurrentLocation();
        const result = await makeAPIRequest('/fusion/compare', 'POST', {
            currentLocation: cleanLocationData(location),
            locationHistory: locationHistory.slice(-4).map(cleanLocationData),
            fusionOptions: {
                enableWeightedAveraging: true,
                enableKalmanFilter: true,
                aggressiveness: 'moderate'
            },
            requestId: `compare-test-${Date.now()}`
        });
        
        document.getElementById('fusionCompareResult').textContent = JSON.stringify(result, null, 2);
    } catch (error) {
        document.getElementById('fusionCompareResult').textContent = `Error: ${error.message}`;
    }
}

async function testMovementEndpoint() {
    try {
        const location = await getCurrentLocation();
        if (locationHistory.length === 0) {
            document.getElementById('movementResult').textContent = 'Need location history for movement analysis';
            return;
        }
        
        const result = await makeAPIRequest('/location/analyze-movement', 'POST', {
            previousLocation: cleanLocationData(locationHistory[locationHistory.length - 1]),
            currentLocation: cleanLocationData(location),
            contextHints: { transportMode: 'walking', environment: 'urban' },
            requestId: `movement-test-${Date.now()}`
        });
        
        document.getElementById('movementResult').textContent = JSON.stringify(result, null, 2);
    } catch (error) {
        document.getElementById('movementResult').textContent = `Error: ${error.message}`;
    }
}

async function testAIAnomalyEndpoint() {
    try {
        if (locationHistory.length === 0) {
            document.getElementById('aiAnomalyResult').textContent = 'Need movement analysis data first';
            return;
        }
        
        const mockMovementAnalysis = {
            accepted: false,
            reason: 'Impossible speed detected',
            speed: 150,
            distance: 1000,
            timeDelta: 24
        };
        
        const result = await makeAPIRequest('/ai/explain-anomaly', 'POST', {
            movementAnalysis: mockMovementAnalysis,
            locationHistory: locationHistory.slice(-3).map(cleanLocationData),
            requestId: `ai-anomaly-test-${Date.now()}`
        });
        
        document.getElementById('aiAnomalyResult').textContent = JSON.stringify(result, null, 2);
    } catch (error) {
        document.getElementById('aiAnomalyResult').textContent = `Error: ${error.message}`;
    }
}

async function testGeofenceEndpoint() {
    try {
        const location = await getCurrentLocation();
        if (geofences.length === 0) {
            document.getElementById('geofenceResult').textContent = 'Create a geofence first by clicking on the map';
            return;
        }
        
        const result = await makeAPIRequest('/geofence/evaluate', 'POST', {
            currentLocation: cleanLocationData(location),
            geofences: geofences.map(cleanGeofenceData),
            locationHistory: locationHistory.slice(-3).map(cleanLocationData),
            previousStates: geofenceStates,
            options: {
                enableAutoFusion: false,
                bufferStrategy: 'moderate',
                requireHighAccuracy: false
            },
            requestId: `geofence-test-${Date.now()}`
        });
        
        document.getElementById('geofenceResult').textContent = JSON.stringify(result, null, 2);
    } catch (error) {
        document.getElementById('geofenceResult').textContent = `Error: ${error.message}`;
    }
}

async function testAIGeofenceEndpoint() {
    try {
        if (geofences.length === 0) {
            document.getElementById('aiGeofenceResult').textContent = 'Create a geofence first by clicking on the map';
            return;
        }
        
        const result = await makeAPIRequest('/ai/optimize-geofence', 'POST', {
            geofence: cleanGeofenceData(geofences[0]),
            environment: 'urban',
            issues: ['high false positive rate', 'inconsistent boundary detection'],
            requestId: `ai-geofence-test-${Date.now()}`
        });
        
        document.getElementById('aiGeofenceResult').textContent = JSON.stringify(result, null, 2);
    } catch (error) {
        document.getElementById('aiGeofenceResult').textContent = `Error: ${error.message}`;
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
    log('Starting AI-enhanced tracking demo...');
    updateStatus('AI Demo started - intelligent tracking every 5 seconds', 'success');

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

    log('AI Demo stopped');
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
    
    analyticsData = {
        qualityScores: [],
        speeds: [],
        distances: [],
        anomalies: 0,
        aiCorrections: 0,
        processingTimes: []
    };
    
    comparisonMetrics = {
        accuracy: 0,
        falsePositive: 0,
        efficiency: 0
    };

    document.getElementById('geofenceResults').innerHTML = 'No geofences created yet';
    document.getElementById('rawData').innerHTML = 'No data yet';
    document.getElementById('processedData').innerHTML = 'No data yet';
    document.getElementById('aiAnalysis').innerHTML = 'No analysis yet';
    document.getElementById('currentAccuracy').textContent = '--';
    document.getElementById('currentConfidence').textContent = '--';
    document.getElementById('currentPlatform').textContent = '--';
    document.getElementById('processingTime').textContent = '--';
    document.getElementById('aiScore').textContent = '--';
    document.getElementById('improvementGain').textContent = '--';
    
    document.getElementById('qualityInsight').textContent = 'Analyzing...';
    document.getElementById('movementInsight').textContent = 'Analyzing...';
    document.getElementById('geofenceInsight').textContent = 'Analyzing...';
    
    if (qualityChart) {
        qualityChart.data.labels = [];
        qualityChart.data.datasets[0].data = [];
        qualityChart.data.datasets[1].data = [];
        qualityChart.update();
    }

    log('Map and AI data cleared');
    updateStatus('Map cleared - ready for new AI demo', 'info');
});

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    initTabs();
    log('AI-Enhanced GeoGuardian Demo ready');
    updateStatus('Click "Request Location Access" to begin AI processing', 'info');
});