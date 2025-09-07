import express from 'express';
import { LocationValidator } from '../utils/locationValidator';
import { LocationAI } from '../utils/locationAI';
import { LocationReading } from '../types/location';

const router = express.Router();

router.post('/validate-location', async (req, res) => {
  try {
    const { currentLocation, locationHistory = [], context, requestId } = req.body;
    
    if (!currentLocation) {
      return res.status(400).json({
        success: false,
        error: 'currentLocation is required',
        requestId
      });
    }

    const locationValidation = LocationValidator.validate(currentLocation);
    if (!locationValidation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid currentLocation: ${locationValidation.errors.join(', ')}`,
        requestId
      });
    }

    const sanitizedCurrent = LocationValidator.sanitize(currentLocation);
    const sanitizedHistory = locationHistory.map((loc: any) => LocationValidator.sanitize(loc));

    const ai = LocationAI.getInstance();
    const validation = await ai.validateLocationPlausibility({
      current: sanitizedCurrent,
      history: sanitizedHistory,
      context
    });

    res.json({
      success: true,
      data: validation,
      requestId
    });

  } catch (error) {
    console.error('AI location validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate location with AI',
      requestId: req.body?.requestId
    });
  }
});

router.post('/explain-anomaly', async (req, res) => {
  try {
    const { movementAnalysis, locationHistory = [], requestId } = req.body;
    
    if (!movementAnalysis) {
      return res.status(400).json({
        success: false,
        error: 'movementAnalysis is required',
        requestId
      });
    }

    const ai = LocationAI.getInstance();
    const explanation = await ai.explainMovementAnomaly(movementAnalysis, locationHistory);

    res.json({
      success: true,
      data: explanation,
      requestId
    });

  } catch (error) {
    console.error('AI anomaly explanation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to explain anomaly with AI',
      requestId: req.body?.requestId
    });
  }
});

router.post('/optimize-geofence', async (req, res) => {
  try {
    const { geofence, environment, issues = [], requestId } = req.body;
    
    if (!geofence) {
      return res.status(400).json({
        success: false,
        error: 'geofence is required',
        requestId
      });
    }

    const ai = LocationAI.getInstance();
    const optimization = await ai.optimizeGeofence(geofence, environment || 'unknown', issues);

    res.json({
      success: true,
      data: optimization,
      requestId
    });

  } catch (error) {
    console.error('AI geofence optimization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize geofence with AI',
      requestId: req.body?.requestId
    });
  }
});

export default router;