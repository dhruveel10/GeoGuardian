import express from 'express';
import { LocationValidator } from '../utils/locationValidator';
import { LocationAnalyzer } from '../utils/locationAnalyzer';
import { LocationFusionEngine } from '../utils/locationFusionEngine';
import { MovementAnomalyAnalyzer } from '../utils/movementAnomalyAnalyzer';
import { GeofenceUtils } from '../utils/geofenceUtils';
import { 
  GeofenceEvaluationRequest,
  GeofenceEvaluationResponse,
  GeofenceEvaluationResult,
  GeofenceState,
  Geofence
} from '../types/geofence';

const router = express.Router();

router.post('/evaluate', (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      currentLocation, 
      geofences, 
      locationHistory = [], 
      previousStates = [], 
      options = {},
      requestId 
    } = req.body as GeofenceEvaluationRequest;
    
    const requestValidation = GeofenceUtils.validateEvaluationRequest(req.body);
    if (!requestValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid evaluation request: ${requestValidation.errors.join(', ')}`,
        requestId
      } as GeofenceEvaluationResponse);
    }

    const locationValidation = LocationValidator.validate(currentLocation);
    if (!locationValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid currentLocation: ${locationValidation.errors.join(', ')}`,
        requestId
      } as GeofenceEvaluationResponse);
    }

    let processedLocation = LocationValidator.sanitize(currentLocation);
    const detectedPlatform = LocationAnalyzer.detectPlatform(req.get('User-Agent'));
    processedLocation.platform = currentLocation.platform || detectedPlatform;

    const evaluationOptions = {
      ...GeofenceUtils.getDefaultOptions(),
      ...options
    };

    let fusionApplied = false;
    let movementAnalyzed = false;

    if (evaluationOptions.enableAutoFusion && locationHistory.length > 0) {
      const sanitizedHistory = locationHistory.map(loc => LocationValidator.sanitize(loc));
      
      const fusionResult = LocationFusionEngine.fuseLocation(
        processedLocation,
        sanitizedHistory,
        {
          enableWeightedAveraging: true,
          enableKalmanFilter: false,
          aggressiveness: evaluationOptions.bufferStrategy === 'conservative' ? 'conservative' : 
                         evaluationOptions.bufferStrategy === 'aggressive' ? 'aggressive' : 'moderate'
        }
      );

      if (fusionResult.appliedCorrections.length > 0) {
        processedLocation = fusionResult.fusedLocation;
        fusionApplied = true;
      }
    }

    if (locationHistory.length > 0) {
      const lastLocation = locationHistory[locationHistory.length - 1];
      const movementAnalysis = MovementAnomalyAnalyzer.analyzeMovement({
        previousLocation: lastLocation,
        currentLocation: processedLocation
      });
      movementAnalyzed = true;

      if (!movementAnalysis.accepted && movementAnalysis.confidence < 0.7) {
        return res.status(400).json({
          success: false,
          error: `Movement anomaly detected: ${movementAnalysis.reason}`,
          requestId
        } as GeofenceEvaluationResponse);
      }
    }

    const locationQuality = LocationAnalyzer.analyzeQuality(processedLocation);
    const evaluations: GeofenceEvaluationResult[] = [];
    const updatedStates: GeofenceState[] = [];

    for (const geofence of geofences) {
      const previousState = previousStates.find(s => s.geofenceId === geofence.id);
      
      const distance = GeofenceUtils.calculateDistance(
        processedLocation.latitude,
        processedLocation.longitude,
        geofence.center.latitude,
        geofence.center.longitude
      );

      const zones = GeofenceUtils.calculateGeofenceZones(geofence, processedLocation, evaluationOptions);
      
      const status = GeofenceUtils.determineGeofenceStatus(distance, zones, previousState);
      
      const confidence = GeofenceUtils.calculateConfidence(
        distance, 
        zones, 
        processedLocation, 
        evaluationOptions
      );

      const dwellTime = previousState ? previousState.dwellTimeInside : 0;
      const triggered = GeofenceUtils.determineTriggeredEvent(status, previousState, geofence, dwellTime);
      
      const recommendation = GeofenceUtils.generateRecommendation(
        status, 
        confidence, 
        processedLocation, 
        zones, 
        evaluationOptions
      );

      const platformSettings = (GeofenceUtils as any).PLATFORM_SETTINGS[processedLocation.platform || 'unknown'];
      const bufferSettings = (GeofenceUtils as any).BUFFER_SETTINGS[evaluationOptions.bufferStrategy || 'moderate'];
      
      const baseBuffer = Math.max(bufferSettings.minBuffer, processedLocation.accuracy * bufferSettings.multiplier);
      const platformBuffer = baseBuffer * platformSettings.bufferMultiplier;
      
      const platformSpecificFactors: string[] = [];
      if (zones.platformAdjusted) {
        platformSpecificFactors.push(`${processedLocation.platform} platform buffer adjustment applied`);
      }
      if (confidence !== confidence * platformSettings.confidenceBoost) {
        platformSpecificFactors.push(`${processedLocation.platform} confidence adjustment: ${platformSettings.confidenceBoost}x`);
      }

      const evaluation: GeofenceEvaluationResult = {
        geofenceId: geofence.id,
        status: status as any,
        confidence: Math.round(confidence * 1000) / 1000,
        triggered: triggered as any,
        recommendation: recommendation as any,
        debugInfo: {
          distanceToCenter: Math.round(distance * 100) / 100,
          geofenceRadius: geofence.radius,
          zones,
          locationQuality: {
            accuracy: processedLocation.accuracy,
            platform: processedLocation.platform || 'unknown',
            qualityGrade: locationQuality.grade,
            fusionApplied,
            movementAnalyzed
          },
          stateHistory: {
            previousStatus: previousState?.status,
            consecutiveOutsideCount: previousState?.consecutiveOutsideCount || 0,
            dwellTimeInside: dwellTime,
            lastTransitionTime: previousState?.lastTransitionTime
          },
          platformAnalysis: {
            baseBuffer: Math.round(baseBuffer * 100) / 100,
            platformMultiplier: platformSettings.bufferMultiplier,
            finalBuffer: Math.round(zones.bufferSize * 100) / 100,
            confidenceAdjustment: platformSettings.confidenceBoost,
            platformSpecificFactors
          },
          nextActions: {
            suggestedWaitTime: recommendation === 'wait' ? 5 : undefined,
            highAccuracyThreshold: zones.bufferSize * 0.5,
            alternativeApproaches: confidence < 0.5 ? 
              ['Enable location fusion', 'Request high accuracy GPS', 'Wait for better signal'] : 
              []
          }
        }
      };

      evaluations.push(evaluation);

      const updatedState = GeofenceUtils.updateGeofenceState(
        geofence.id,
        status,
        previousState,
        triggered === 'entry',
        triggered === 'exit'
      );
      updatedStates.push(updatedState);
    }

    const globalRecommendation = GeofenceUtils.calculateGlobalRecommendation(evaluations);
    const processingTime = Date.now() - startTime;
    const summary = GeofenceUtils.createSummary(evaluations, processingTime);

    const response: GeofenceEvaluationResponse = {
      success: true,
      data: {
        evaluations,
        globalRecommendation: globalRecommendation as any,
        updatedStates,
        summary
      },
      requestId
    };

    res.json(response);

  } catch (error) {
    console.error('Geofence evaluation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to evaluate geofences',
      requestId: req.body?.requestId
    } as GeofenceEvaluationResponse);
  }
});

router.post('/validate', (req, res) => {
  try {
    const { geofences, requestId } = req.body;
    
    if (!geofences || !Array.isArray(geofences)) {
      return res.status(400).json({
        success: false,
        error: 'Geofences array is required',
        requestId
      });
    }

    const validationResults = geofences.map((geofence: any, index: number) => {
      const validation = GeofenceUtils.validateGeofence(geofence);
      return {
        index,
        geofenceId: geofence.id,
        isValid: validation.isValid,
        errors: validation.errors
      };
    });

    const invalidGeofences = validationResults.filter(r => !r.isValid);
    
    res.json({
      success: true,
      data: {
        totalGeofences: geofences.length,
        validGeofences: validationResults.length - invalidGeofences.length,
        invalidGeofences: invalidGeofences.length,
        validationResults
      },
      requestId
    });

  } catch (error) {
    console.error('Geofence validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate geofences',
      requestId: req.body?.requestId
    });
  }
});

router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      supportedPlatforms: ['ios', 'android', 'web', 'unknown'],
      bufferStrategies: {
        conservative: {
          description: 'Minimal buffer zones for high-accuracy scenarios',
          multiplier: 1.2,
          maxRatio: 0.3,
          minBuffer: 15,
          bestFor: ['High-precision GPS', 'Small geofences', 'Critical applications']
        },
        moderate: {
          description: 'Balanced buffer zones for general use',
          multiplier: 1.5,
          maxRatio: 0.4,
          minBuffer: 20,
          bestFor: ['Most applications', 'Mixed environments', 'General tracking']
        },
        aggressive: {
          description: 'Large buffer zones for poor GPS conditions',
          multiplier: 2.0,
          maxRatio: 0.5,
          minBuffer: 25,
          bestFor: ['Indoor usage', 'Urban canyons', 'Web platforms']
        }
      },
      platformOptimizations: {
        ios: {
          bufferMultiplier: 0.8,
          confidenceBoost: 1.2,
          description: 'Optimized for iOS GPS accuracy and characteristics'
        },
        android: {
          bufferMultiplier: 1.0,
          confidenceBoost: 1.0,
          description: 'Balanced settings for Android GPS variations'
        },
        web: {
          bufferMultiplier: 1.4,
          confidenceBoost: 0.7,
          description: 'Enhanced for browser geolocation limitations'
        },
        unknown: {
          bufferMultiplier: 1.2,
          confidenceBoost: 0.8,
          description: 'Conservative settings for unidentified platforms'
        }
      },
      statusDefinitions: {
        inside: 'Location is definitely within the geofence',
        outside: 'Location is definitely outside the geofence',
        uncertain: 'Location is in the uncertainty zone, state unclear',
        approaching: 'Moving from outside toward inside the geofence',
        leaving: 'Moving from inside toward outside the geofence'
      },
      recommendations: {
        continue: 'Current reading is reliable, proceed normally',
        request_high_accuracy: 'Request high-accuracy GPS reading',
        wait: 'Wait for better GPS signal or next reading',
        fusion_needed: 'Location fusion recommended for better accuracy'
      },
      limits: {
        maxGeofencesPerRequest: 20,
        minGeofenceRadius: 10,
        maxGeofenceRadius: 10000,
        maxLocationHistoryAge: 300000
      },
      examples: {
        buildingEntry: {
          radius: 30,
          recommendedStrategy: 'conservative',
          expectedAccuracy: '5-15m',
          platform: 'iOS/Android'
        },
        parkingLot: {
          radius: 100,
          recommendedStrategy: 'moderate',
          expectedAccuracy: '10-30m',
          platform: 'All platforms'
        },
        campusZone: {
          radius: 500,
          recommendedStrategy: 'moderate',
          expectedAccuracy: '20-50m',
          platform: 'All platforms'
        },
        webApplication: {
          radius: 200,
          recommendedStrategy: 'aggressive',
          expectedAccuracy: '50-100m',
          platform: 'Web'
        }
      }
    }
  });
});

router.get('/zones/calculate', (req, res) => {
  try {
    const { radius, accuracy, platform, strategy } = req.query;
    
    if (!radius || !accuracy) {
      return res.status(400).json({
        success: false,
        error: 'radius and accuracy parameters are required'
      });
    }

    const mockLocation = {
      latitude: 0,
      longitude: 0,
      accuracy: parseFloat(accuracy as string),
      timestamp: Date.now(),
      platform: (platform as any) || 'unknown'
    };

    const mockGeofence = {
      id: 'calculation',
      center: { latitude: 0, longitude: 0 },
      radius: parseFloat(radius as string)
    };

    const options = {
      bufferStrategy: (strategy as any) || 'moderate'
    };

    const zones = GeofenceUtils.calculateGeofenceZones(mockGeofence, mockLocation, options);
    
    res.json({
      success: true,
      data: {
        input: {
          radius: parseFloat(radius as string),
          accuracy: parseFloat(accuracy as string),
          platform: platform || 'unknown',
          strategy: strategy || 'moderate'
        },
        zones: {
          ...zones,
          uncertaintyZone: zones.outerRadius - zones.innerRadius
        },
        visualization: {
          definitelyInside: `0m - ${zones.innerRadius}m`,
          uncertaintyZone: `${zones.innerRadius}m - ${zones.outerRadius}m`,
          definitelyOutside: `${zones.outerRadius}m+`
        }
      }
    });

  } catch (error) {
    console.error('Zone calculation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to calculate zones'
    });
  }
});

export default router;