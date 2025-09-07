import express from 'express';
import { LocationValidator } from '../utils/locationValidator';
import { MovementAnomalyAnalyzer } from '../utils/movementAnomalyAnalyzer';
import { MovementAnalysisRequest, MovementAnalysisResponse } from '../types/movementAnalysis';

const router = express.Router();

router.post('/analyze-movement', async (req, res) => {
  const startTime = Date.now();
  
  try {
    const { previousLocation, currentLocation, maxReasonableSpeed, contextHints, deviceInfo, requestId } = req.body as MovementAnalysisRequest;
    
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

    const analysisResult = await MovementAnomalyAnalyzer.analyzeMovementWithAI({
      previousLocation: sanitizedPrevious,
      currentLocation: sanitizedCurrent,
      maxReasonableSpeed,
      contextHints,
      deviceInfo,
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

export default router;