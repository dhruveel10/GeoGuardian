import express from 'express';
import { LocationValidator } from '../utils/locationValidator';
import { AdaptiveOptimizer } from '../utils/adaptiveOptimizer';
import { 
  OptimizationRequest, 
  OptimizationResponse 
} from '../types/adaptiveOptimization';

const router = express.Router();

router.post('/optimize', (req, res) => {
  const startTime = Date.now();
  
  try {
    const { 
      currentLocation, 
      locationHistory = [], 
      mode = 'adaptive', 
      context = {}, 
      currentPipelineSettings = {},
      targetUseCase = 'geofencing',
      requestId 
    } = req.body as OptimizationRequest;

    const requestValidation = AdaptiveOptimizer.validateOptimizationRequest(req.body);
    if (!requestValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid optimization request: ${requestValidation.errors.join(', ')}`,
        requestId
      } as OptimizationResponse);
    }

    const locationValidation = LocationValidator.validate(currentLocation);
    if (!locationValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid current location: ${locationValidation.errors.join(', ')}`,
        requestId
      } as OptimizationResponse);
    }

    for (let i = 0; i < locationHistory.length; i++) {
      const historyValidation = LocationValidator.validate(locationHistory[i]);
      if (!historyValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: `Invalid location history[${i}]: ${historyValidation.errors.join(', ')}`,
          requestId
        } as OptimizationResponse);
      }
    }

    const sanitizedCurrent = LocationValidator.sanitize(currentLocation);
    const sanitizedHistory = locationHistory.map(loc => LocationValidator.sanitize(loc));

    const optimizationResult = AdaptiveOptimizer.optimizePipeline(
      sanitizedCurrent,
      sanitizedHistory,
      mode,
      context,
      currentPipelineSettings,
      targetUseCase
    );

    optimizationResult.metadata.processingTime = Date.now() - startTime;

    const response: OptimizationResponse = {
      success: true,
      data: optimizationResult,
      requestId
    };

    res.json(response);

  } catch (error) {
    console.error('Adaptive optimization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize pipeline',
      requestId: req.body?.requestId
    } as OptimizationResponse);
  }
});

router.get('/strategies', (req, res) => {
  res.json({
    success: true,
    data: {
      description: 'Available optimization strategies for location processing pipeline',
      modes: {
        high_accuracy: {
          description: 'Maximum accuracy with high battery usage',
          batteryImpact: 'very_high',
          accuracyTarget: '5m',
          updateFrequency: '5 seconds',
          bestFor: ['Navigation', 'Critical geofencing', 'Survey applications'],
          tradeoffs: 'High power consumption, fastest response times'
        },
        battery_saver: {
          description: 'Optimized for battery life with reduced accuracy',
          batteryImpact: 'low',
          accuracyTarget: '50m',
          updateFrequency: '60 seconds',
          bestFor: ['Background tracking', 'Large geofences', 'Long-duration monitoring'],
          tradeoffs: 'Lower accuracy, slower response times, excellent battery life'
        },
        balanced: {
          description: 'Good balance between accuracy and battery life',
          batteryImpact: 'medium',
          accuracyTarget: '20m',
          updateFrequency: '15 seconds',
          bestFor: ['General geofencing', 'Mixed usage patterns', 'Standard applications'],
          tradeoffs: 'Moderate power consumption, good accuracy for most use cases'
        },
        adaptive: {
          description: 'Automatically adjusts based on context',
          batteryImpact: 'variable',
          accuracyTarget: 'context-dependent',
          updateFrequency: 'dynamic',
          bestFor: ['Smart applications', 'Variable usage patterns', 'Context-aware systems'],
          tradeoffs: 'Optimizes in real-time based on conditions and requirements'
        }
      },
      contextFactors: {
        batteryLevel: {
          description: 'Device battery percentage',
          impact: 'High impact on mode selection and optimization aggressiveness',
          thresholds: {
            critical: '<15%',
            low: '15-30%',
            medium: '30-70%',
            high: '>70%'
          }
        },
        movementPattern: {
          description: 'Detected or specified movement behavior',
          options: ['stationary', 'walking', 'cycling', 'driving', 'erratic'],
          impact: 'Affects update frequency, fusion algorithms, and accuracy requirements'
        },
        environment: {
          description: 'Physical environment affecting GPS quality',
          options: ['urban', 'highway', 'indoor', 'rural', 'outdoor'],
          impact: 'Influences buffer zones, accuracy expectations, and verification needs'
        },
        appPriority: {
          description: 'Application priority level',
          options: ['background', 'foreground', 'critical'],
          impact: 'Determines resource allocation and optimization aggressiveness'
        },
        networkType: {
          description: 'Available network connectivity',
          options: ['wifi', 'cellular', 'offline'],
          impact: 'Affects assisted GPS availability and network positioning'
        }
      },
      optimizationComponents: {
        fusion: {
          description: 'Location data fusion and filtering',
          parameters: ['aggressiveness', 'kalman filter', 'weighted averaging', 'history size'],
          impact: 'Determines how multiple location readings are combined'
        },
        location: {
          description: 'GPS acquisition settings',
          parameters: ['update frequency', 'accuracy threshold', 'timeout duration'],
          impact: 'Controls how often and how accurately location is requested'
        },
        geofence: {
          description: 'Geofence evaluation parameters',
          parameters: ['buffer zone', 'multi-check', 'grace period', 'verification delay'],
          impact: 'Affects boundary decision reliability and false trigger prevention'
        },
        movement: {
          description: 'Movement analysis and anomaly detection',
          parameters: ['anomaly threshold', 'speed limits', 'drift tolerance'],
          impact: 'Controls sensitivity to GPS errors and movement validation'
        }
      }
    }
  });
});

router.get('/recommendations', (req, res) => {
  const { 
    useCase, 
    batteryLevel, 
    movementPattern, 
    environment,
    accuracyRequirement 
  } = req.query;

  let recommendedMode = 'balanced';
  const recommendations: string[] = [];

  if (batteryLevel && parseInt(batteryLevel as string) < 20) {
    recommendedMode = 'battery_saver';
    recommendations.push('Battery level is low - prioritize battery saving');
  }

  if (accuracyRequirement === 'critical') {
    recommendedMode = 'high_accuracy';
    recommendations.push('Critical accuracy requirement detected');
  }

  if (useCase === 'navigation') {
    recommendedMode = 'high_accuracy';
    recommendations.push('Navigation requires high accuracy and frequent updates');
  } else if (useCase === 'tracking') {
    recommendedMode = 'battery_saver';
    recommendations.push('Long-term tracking benefits from battery optimization');
  }

  if (environment === 'indoor') {
    recommendations.push('Indoor environment: expect reduced GPS accuracy, consider network positioning');
  } else if (environment === 'urban') {
    recommendations.push('Urban environment: enable high accuracy mode for building interference');
  }

  if (movementPattern === 'stationary') {
    recommendations.push('Stationary pattern: reduce update frequency, increase smoothing');
  } else if (movementPattern === 'driving') {
    recommendations.push('High-speed movement: increase update frequency, enable predictive filtering');
  }

  res.json({
    success: true,
    data: {
      recommendedMode,
      recommendations,
      contextAnalysis: {
        useCase: useCase || 'general',
        batteryLevel: batteryLevel ? parseInt(batteryLevel as string) : undefined,
        movementPattern: movementPattern || 'unknown',
        environment: environment || 'unknown',
        accuracyRequirement: accuracyRequirement || 'medium'
      },
      nextSteps: [
        `Use mode: ${recommendedMode}`,
        'Monitor battery consumption and adjust if needed',
        'Track location accuracy and optimize based on results',
        'Re-evaluate when context changes significantly'
      ]
    }
  });
});

router.post('/context-analysis', (req, res) => {
  const startTime = Date.now();
  
  try {
    const { currentLocation, locationHistory = [], context = {} } = req.body;

    if (!currentLocation) {
      return res.status(400).json({
        success: false,
        error: 'Current location is required for context analysis'
      });
    }

    const locationValidation = LocationValidator.validate(currentLocation);
    if (!locationValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid location: ${locationValidation.errors.join(', ')}`
      });
    }

    const sanitizedLocation = LocationValidator.sanitize(currentLocation);
    const sanitizedHistory = locationHistory.map((loc: any) => LocationValidator.sanitize(loc));

    const dummyResult = AdaptiveOptimizer.optimizePipeline(
      sanitizedLocation,
      sanitizedHistory,
      'adaptive',
      context,
      {},
      'general'
    );

    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        contextAnalysis: dummyResult.contextAnalysis,
        detectedPatterns: {
          movementPattern: dummyResult.contextAnalysis.estimatedMovementPattern,
          environment: dummyResult.contextAnalysis.detectedEnvironment,
          batteryOptimizationPotential: dummyResult.contextAnalysis.batteryOptimizationPotential,
          accuracyRequirement: dummyResult.contextAnalysis.accuracyRequirement
        },
        riskFactors: dummyResult.contextAnalysis.riskFactors,
        recommendations: [
          `Detected ${dummyResult.contextAnalysis.estimatedMovementPattern} movement pattern`,
          `Environment appears to be ${dummyResult.contextAnalysis.detectedEnvironment}`,
          `Accuracy requirement level: ${dummyResult.contextAnalysis.accuracyRequirement}`,
          `Battery optimization potential: ${Math.round(dummyResult.contextAnalysis.batteryOptimizationPotential * 100)}%`
        ],
        processingTime
      }
    });

  } catch (error) {
    console.error('Context analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze context'
    });
  }
});

export default router;