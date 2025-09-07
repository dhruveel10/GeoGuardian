import express from 'express';
import { LocationValidator } from '../utils/locationValidator';
import { LocationAnalyzer } from '../utils/locationAnalyzer';
import { LocationFusionEngine } from '../utils/locationFusionEngine';
import { MovementAnomalyAnalyzer } from '../utils/movementAnomalyAnalyzer';
import { 
  FusionRequest, 
  FusionResponse,
  ComparisonRequest,
  ComparisonResponse 
} from '../types/locationFusion';

const router = express.Router();

router.post('/fused', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { currentLocation, locationHistory = [], fusionOptions, requestId } = req.body as FusionRequest;
    
    const fusionValidation = LocationFusionEngine.validateFusionRequest(req.body);
    if (!fusionValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid fusion request: ${fusionValidation.errors.join(', ')}`,
        requestId
      } as FusionResponse);
    }

    const locationValidation = LocationValidator.validate(currentLocation);
    if (!locationValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid currentLocation: ${locationValidation.errors.join(', ')}`,
        requestId
      } as FusionResponse);
    }

    for (let i = 0; i < locationHistory.length; i++) {
      const historyValidation = LocationValidator.validate(locationHistory[i]);
      if (!historyValidation.isValid) {
        return res.status(400).json({
          success: false,
          error: `Invalid locationHistory[${i}]: ${historyValidation.errors.join(', ')}`,
          requestId
        } as FusionResponse);
      }
    }

    const sanitizedCurrent = LocationValidator.sanitize(currentLocation);
    const sanitizedHistory = locationHistory.map(loc => LocationValidator.sanitize(loc));
    
    const detectedPlatform = LocationAnalyzer.detectPlatform(req.get('User-Agent'));
    sanitizedCurrent.platform = currentLocation.platform || detectedPlatform;

    const options = {
      ...LocationFusionEngine.getDefaultOptions(),
      ...fusionOptions
    };

    const fusionResult = await LocationFusionEngine.fuseLocation(
      sanitizedCurrent,
      sanitizedHistory,
      options
    );

    const originalQuality = LocationAnalyzer.analyzeQuality(fusionResult.originalLocation);
    const fusedQuality = LocationAnalyzer.analyzeQuality(fusionResult.fusedLocation);

    const distanceShift = LocationFusionEngine['calculateDistance'](
      fusionResult.originalLocation.latitude,
      fusionResult.originalLocation.longitude,
      fusionResult.fusedLocation.latitude,
      fusionResult.fusedLocation.longitude
    );

    const accuracyImprovement = fusionResult.originalLocation.accuracy - fusionResult.fusedLocation.accuracy;
    const processingTime = Date.now() - startTime;

    const response: FusionResponse = {
      success: true,
      data: {
        original: {
          location: fusionResult.originalLocation,
          quality: originalQuality
        },
        fused: {
          location: fusionResult.fusedLocation,
          quality: fusedQuality
        },
        fusion: {
          appliedCorrections: fusionResult.appliedCorrections,
          confidenceImprovement: fusionResult.confidenceImprovement,
          metadata: fusionResult.fusionMetadata
        },
        comparison: {
          accuracyImprovement: Math.round(accuracyImprovement * 100) / 100,
          distanceShift: Math.round(distanceShift * 100) / 100,
          processingTime
        }
      },
      requestId
    };

    res.json(response);

  } catch (error) {
    console.error('Location fusion error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process location fusion',
      requestId: req.body?.requestId
    } as FusionResponse);
  }
});

router.post('/compare', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { currentLocation, locationHistory = [], fusionOptions, requestId } = req.body as ComparisonRequest;
    
    const fusionValidation = LocationFusionEngine.validateFusionRequest(req.body);
    if (!fusionValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid comparison request: ${fusionValidation.errors.join(', ')}`,
        requestId
      } as ComparisonResponse);
    }

    const locationValidation = LocationValidator.validate(currentLocation);
    if (!locationValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid currentLocation: ${locationValidation.errors.join(', ')}`,
        requestId
      } as ComparisonResponse);
    }

    const sanitizedCurrent = LocationValidator.sanitize(currentLocation);
    const sanitizedHistory = locationHistory.map(loc => LocationValidator.sanitize(loc));
    
    const detectedPlatform = LocationAnalyzer.detectPlatform(req.get('User-Agent'));
    sanitizedCurrent.platform = currentLocation.platform || detectedPlatform;

    const rawQuality = LocationAnalyzer.analyzeQuality(sanitizedCurrent);

    const options = {
      ...LocationFusionEngine.getDefaultOptions(),
      ...fusionOptions
    };

    const fusionResult = await LocationFusionEngine.fuseLocation(
      sanitizedCurrent,
      sanitizedHistory,
      options
    );

    const fusedQuality = LocationAnalyzer.analyzeQuality(fusionResult.fusedLocation);

    let rawMovementAnalysis = undefined;
    let fusedMovementAnalysis = undefined;

    if (sanitizedHistory.length > 0) {
      const lastLocation = sanitizedHistory[sanitizedHistory.length - 1];
      
      rawMovementAnalysis = MovementAnomalyAnalyzer.analyzeMovement({
        previousLocation: lastLocation,
        currentLocation: sanitizedCurrent
      });

      fusedMovementAnalysis = MovementAnomalyAnalyzer.analyzeMovement({
        previousLocation: lastLocation,
        currentLocation: fusionResult.fusedLocation
      });
    }

    const distanceShift = LocationFusionEngine['calculateDistance'](
      sanitizedCurrent.latitude,
      sanitizedCurrent.longitude,
      fusionResult.fusedLocation.latitude,
      fusionResult.fusedLocation.longitude
    );

    const accuracyGain = sanitizedCurrent.accuracy - fusionResult.fusedLocation.accuracy;
    const qualityScoreGain = fusedQuality.score - rawQuality.score;
    const recommendationsReduced = Math.max(0, rawQuality.recommendations.length - fusedQuality.recommendations.length);
    const accuracyRadiusChange = accuracyGain;

    const processingTime = Date.now() - startTime;

    const response: ComparisonResponse = {
      success: true,
      data: {
        raw: {
          location: sanitizedCurrent,
          quality: rawQuality,
          movementAnalysis: rawMovementAnalysis
        },
        fused: {
          location: fusionResult.fusedLocation,
          quality: fusedQuality,
          movementAnalysis: fusedMovementAnalysis
        },
        improvements: {
          accuracyGain: Math.round(accuracyGain * 100) / 100,
          qualityScoreGain: Math.round(qualityScoreGain * 100) / 100,
          confidenceGain: fusionResult.confidenceImprovement,
          recommendationsReduced
        },
        visualComparison: {
          distanceShift: Math.round(distanceShift * 100) / 100,
          accuracyRadiusChange: Math.round(accuracyRadiusChange * 100) / 100,
          platformOptimizations: fusionResult.appliedCorrections
        }
      },
      requestId
    };

    res.json(response);

  } catch (error) {
    console.error('Location comparison error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to compare locations',
      requestId: req.body?.requestId
    } as ComparisonResponse);
  }
});

router.get('/fusion-info', (req, res) => {
  res.json({
    success: true,
    data: {
      algorithms: {
        weightedAveraging: {
          description: 'Combines multiple location readings with time and accuracy weighting',
          benefits: ['Reduces GPS noise', 'Platform-aware corrections', 'Accuracy improvements'],
          bestFor: ['Stationary usage', 'Urban environments', 'Poor GPS conditions']
        },
        kalmanFilter: {
          description: 'Predictive filtering based on movement patterns',
          benefits: ['Smooth movement tracking', 'Jump detection', 'Velocity estimation'],
          bestFor: ['Moving objects', 'Navigation', 'Real-time tracking']
        }
      },
      aggressivenessLevels: {
        conservative: {
          description: 'Minimal corrections, preserves original readings',
          maxCorrection: '20m',
          useCase: 'High-accuracy applications requiring data integrity'
        },
        moderate: {
          description: 'Balanced corrections for general use',
          maxCorrection: '50m',
          useCase: 'Most applications, good balance of accuracy and stability'
        },
        aggressive: {
          description: 'Maximum corrections for poor GPS conditions',
          maxCorrection: '100m',
          useCase: 'Indoor usage, urban canyons, emergency situations'
        }
      },
      platformSupport: {
        ios: 'Optimized for iOS GPS characteristics and accuracy reporting',
        android: 'Adjusted for Android location service variations',
        web: 'Enhanced for browser geolocation limitations',
        unknown: 'Generic optimizations for unidentified platforms'
      },
      recommendations: {
        historySize: '3-5 recent locations for optimal results',
        maxAge: '5 minutes for location history',
        updateFrequency: 'Every 1-30 seconds depending on movement speed',
        batteryConsideration: 'Conservative mode recommended for low battery'
      }
    }
  });
});

export default router;