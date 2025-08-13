import express from 'express';
import { LocationValidator } from '../utils/locationValidator';
import { MovementAnomalyAnalyzer } from '../utils/movementAnomalyAnalyzer';
import { MovementAnalysisRequest, MovementAnalysisResponse } from '../types/movementAnalysis';

const router = express.Router();

router.post('/analyze-movement', (req, res) => {
  const startTime = Date.now();
  
  try {
    const { previousLocation, currentLocation, maxReasonableSpeed, contextHints, requestId } = req.body as MovementAnalysisRequest;
    
    if (!previousLocation || !currentLocation) {
      return res.status(400).json({
        success: false,
        error: 'Both previousLocation and currentLocation are required',
        requestId
      } as MovementAnalysisResponse);
    }

    const prevValidation = LocationValidator.validate(previousLocation);
    if (!prevValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid previousLocation: ${prevValidation.errors.join(', ')}`,
        requestId
      } as MovementAnalysisResponse);
    }

    const currValidation = LocationValidator.validate(currentLocation);
    if (!currValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid currentLocation: ${currValidation.errors.join(', ')}`,
        requestId
      } as MovementAnalysisResponse);
    }

    const sanitizedPrevious = LocationValidator.sanitize(previousLocation);
    const sanitizedCurrent = LocationValidator.sanitize(currentLocation);

    const analysisResult = MovementAnomalyAnalyzer.analyzeMovement({
      previousLocation: sanitizedPrevious,
      currentLocation: sanitizedCurrent,
      maxReasonableSpeed,
      contextHints,
      requestId
    });

    analysisResult.metadata.processingTime = Date.now() - startTime;

    const response: MovementAnalysisResponse = {
      success: true,
      data: analysisResult,
      requestId
    };

    res.json(response);

  } catch (error) {
    console.error('Movement analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze movement',
      requestId: req.body?.requestId
    } as MovementAnalysisResponse);
  }
});

router.get('/movement-limits', (req, res) => {
  const { transportMode, environment } = req.query;
  
  const contextHints = {
    transportMode: transportMode as any,
    environment: environment as any
  };

  const limits = MovementAnomalyAnalyzer.getSpeedLimitsForContext(contextHints);

  res.json({
    success: true,
    data: {
      transportMode: transportMode || 'unknown',
      environment: environment || 'unknown',
      speedLimits: {
        ...limits,
        unit: 'km/h'
      },
      availableTransportModes: ['walking', 'cycling', 'driving', 'flying', 'stationary', 'unknown'],
      availableEnvironments: ['urban', 'highway', 'indoor', 'rural', 'outdoor', 'unknown']
    }
  });
});

router.post('/batch-movement-analysis', (req, res) => {
  const startTime = Date.now();
  
  try {
    const { locationSequence, contextHints } = req.body;
    
    if (!Array.isArray(locationSequence) || locationSequence.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'locationSequence must be an array with at least 2 locations'
      });
    }

    const results = [];
    let totalAnomalies = 0;
    let totalDistance = 0;

    for (let i = 1; i < locationSequence.length; i++) {
      const analysis = MovementAnomalyAnalyzer.analyzeMovement({
        previousLocation: locationSequence[i - 1],
        currentLocation: locationSequence[i],
        contextHints
      });

      results.push({
        segmentIndex: i,
        from: locationSequence[i - 1],
        to: locationSequence[i],
        analysis
      });

      if (!analysis.accepted) {
        totalAnomalies++;
      }
      totalDistance += analysis.distance;
    }

    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        totalSegments: locationSequence.length - 1,
        totalDistance: Math.round(totalDistance),
        totalAnomalies,
        anomalyRate: Math.round((totalAnomalies / results.length) * 100) / 100,
        results,
        metadata: {
          processingTime,
          analyzedSegments: results.length
        }
      }
    });

  } catch (error) {
    console.error('Batch movement analysis error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to analyze movement sequence'
    });
  }
});

router.get('/example', (req, res) => {
  res.json({
    endpoint: 'POST /api/v1/location/analyze-movement',
    description: 'Analyze movement between two location readings to detect GPS anomalies',
    exampleRequest: {
      previousLocation: {
        latitude: 40.7128,
        longitude: -74.0060,
        accuracy: 15,
        timestamp: 1693334400000
      },
      currentLocation: {
        latitude: 40.7200,
        longitude: -74.0100,
        accuracy: 20,
        timestamp: 1693334405000
      },
      maxReasonableSpeed: 150,
      contextHints: {
        transportMode: 'driving',
        environment: 'urban'
      },
      requestId: 'movement-test-123'
    },
    expectedResponse: {
      success: true,
      data: {
        accepted: false,
        distance: 894.5,
        timeElapsed: 5,
        impliedSpeed: 643.24,
        speedUnit: 'km/h',
        anomalyType: 'impossible_speed',
        confidence: 0,
        reason: 'Impossible speed: 643.2 km/h (max expected: 150 km/h)',
        recommendation: 'GPS error detected - request fresh location reading'
      }
    }
  });
});

export default router;