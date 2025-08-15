import express from 'express';
import { LocationValidator } from '../utils/locationValidator';
import { GeofenceEvaluator } from '../utils/geofenceEvaluator';
import { 
  GeofenceEvaluationRequest, 
  GeofenceEvaluationResponse 
} from '../types/geofenceEvaluation';

const router = express.Router();

router.post('/evaluate', (req, res) => {
  const startTime = Date.now();
  
  try {
    const { location, geofence, evaluationOptions, requestId } = req.body as GeofenceEvaluationRequest;
    
    const requestValidation = GeofenceEvaluator.validateGeofenceRequest(req.body);
    if (!requestValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid geofence request: ${requestValidation.errors.join(', ')}`,
        requestId
      } as GeofenceEvaluationResponse);
    }

    const locationValidation = LocationValidator.validate(location);
    if (!locationValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid location data: ${locationValidation.errors.join(', ')}`,
        requestId
      } as GeofenceEvaluationResponse);
    }
    const sanitizedLocation = LocationValidator.sanitize(location);
    
    const evaluationResult = GeofenceEvaluator.evaluateGeofence(
      sanitizedLocation,
      geofence,
      evaluationOptions || {}
    );

    evaluationResult.metadata.processingTime = Date.now() - startTime;

    const response: GeofenceEvaluationResponse = {
      success: true,
      data: evaluationResult,
      requestId
    };

    res.json(response);

  } catch (error) {
    console.error('Geofence evaluation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to evaluate geofence',
      requestId: req.body?.requestId
    } as GeofenceEvaluationResponse);
  }
});

router.get('/info', (req, res) => {
  res.json({
    success: true,
    data: {
      description: 'Intelligent geofence evaluation with adaptive buffering and state management',
      features: [
        'Adaptive buffer zones based on GPS accuracy',
        'Multi-check verification for boundary conditions',
        'Exit grace periods to prevent false triggers',
        'State transition management',
        'Quality-based confidence scoring',
        'Platform-aware optimizations'
      ],
      statusTypes: {
        inside: 'Location is clearly inside the geofence',
        outside: 'Location is clearly outside the geofence', 
        boundary_zone: 'Location is near the boundary - verification recommended',
        uncertain: 'Location quality too poor for reliable determination'
      },
      bufferZoneCalculation: {
        description: 'Buffer zones are automatically calculated based on GPS accuracy and quality',
        factors: [
          'GPS accuracy (±meters)',
          'Location quality grade',
          'Platform characteristics',
          'Custom multiplier (optional)'
        ],
        defaultMultipliers: {
          excellent: 1.2,
          good: 1.5,
          fair: 2.0,
          poor: 3.0,
          unusable: 5.0
        }
      },
      verificationGuidelines: {
        needsSecondCheck: 'When location is near boundary or quality is poor',
        recommendedDelays: {
          'excellent quality': '1-2 seconds',
          'good quality': '2-3 seconds', 
          'poor quality': '3-5 seconds'
        },
        accuracyModes: {
          high: 'Request highest accuracy for critical boundary decisions',
          balanced: 'Standard accuracy for general use',
          battery_saver: 'Lower accuracy to conserve battery'
        }
      },
      gracePeriodBehavior: {
        description: 'Exit grace periods prevent false exit triggers from GPS drift',
        defaultPeriod: '30 seconds',
        behavior: 'Requires sustained outside readings before confirming exit',
        recommendations: {
          stationary: '60+ seconds grace period',
          walking: '30-45 seconds grace period',
          driving: '15-30 seconds grace period'
        }
      }
    }
  });
});

router.get('/test-scenarios', (req, res) => {
  res.json({
    success: true,
    data: {
      description: 'Common geofencing test scenarios and expected behaviors',
      scenarios: [
        {
          name: 'High Accuracy GPS - Clear Inside',
          location: { accuracy: 5, distanceFromCenter: 30 },
          geofence: { radius: 50 },
          expected: {
            status: 'inside',
            confidence: '>0.9',
            needsVerification: false
          }
        },
        {
          name: 'Poor GPS - Near Boundary',
          location: { accuracy: 40, distanceFromCenter: 48 },
          geofence: { radius: 50 },
          expected: {
            status: 'boundary_zone',
            confidence: '0.4-0.7',
            needsVerification: true,
            bufferZone: '>60m'
          }
        },
        {
          name: 'Stationary - Grace Period Test',
          scenario: 'Device inside geofence, then GPS drifts outside',
          expected: {
            initialStatus: 'inside',
            driftStatus: 'boundary_zone',
            gracePeriodActive: true,
            recommendation: 'wait'
          }
        },
        {
          name: 'Mobile - Quick Transition',
          scenario: 'Device moving at 50km/h crossing boundary',
          expected: {
            shorterGracePeriod: true,
            quickVerification: true,
            status: 'inside or outside (no boundary_zone)'
          }
        }
      ],
      testingTips: [
        'Test with various GPS accuracy levels (5m, 20m, 50m, 100m+)',
        'Simulate boundary crossings in both directions',
        'Test grace period behavior with stationary devices',
        'Verify buffer zone calculations for different quality grades',
        'Test multi-check verification recommendations'
      ]
    }
  });
});

router.post('/batch-evaluate', (req, res) => {
  const startTime = Date.now();
  
  try {
    const { evaluations, requestId } = req.body;
    
    if (!Array.isArray(evaluations) || evaluations.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Evaluations array is required and must not be empty',
        requestId
      });
    }

    if (evaluations.length > 100) {
      return res.status(400).json({
        success: false,
        error: 'Maximum 100 evaluations per batch request',
        requestId
      });
    }

    const results = evaluations.map((evaluation, index) => {
      try {
        const requestValidation = GeofenceEvaluator.validateGeofenceRequest(evaluation);
        if (!requestValidation.isValid) {
          return {
            index,
            success: false,
            error: `Invalid evaluation at index ${index}: ${requestValidation.errors.join(', ')}`
          };
        }

        const locationValidation = LocationValidator.validate(evaluation.location);
        if (!locationValidation.isValid) {
          return {
            index,
            success: false,
            error: `Invalid location at index ${index}: ${locationValidation.errors.join(', ')}`
          };
        }

        const sanitizedLocation = LocationValidator.sanitize(evaluation.location);
        const result = GeofenceEvaluator.evaluateGeofence(
          sanitizedLocation,
          evaluation.geofence,
          evaluation.evaluationOptions || {}
        );

        return {
          index,
          success: true,
          data: result
        };

      } catch (error) {
        return {
          index,
          success: false,
          error: `Evaluation failed at index ${index}: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    });

    const successfulEvaluations = results.filter(r => r.success).length;
    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        results,
        summary: {
          totalEvaluations: evaluations.length,
          successful: successfulEvaluations,
          failed: evaluations.length - successfulEvaluations,
          processingTime
        }
      },
      requestId
    });

  } catch (error) {
    console.error('Batch geofence evaluation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process batch geofence evaluation',
      requestId: req.body?.requestId
    });
  }
});

export default router;