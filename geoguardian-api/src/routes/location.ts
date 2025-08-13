import express from 'express';
import { LocationValidator } from '../utils/locationValidator';
import { LocationAnalyzer } from '../utils/locationAnalyzer';
import { LocationRequest, LocationResponse } from '../types/location';

const router = express.Router();

router.post('/test', (req, res) => {
  const startTime = Date.now();
  
  try {
    const { location, requestId, metadata } = req.body as LocationRequest;
    
    if (!location) {
      return res.status(400).json({
        success: false,
        error: 'Location data is required',
        requestId
      } as LocationResponse);
    }

    const validation = LocationValidator.validate(location);
    if (!validation.isValid) {
      return res.status(400).json({
        success: false,
        error: `Invalid location data: ${validation.errors.join(', ')}`,
        requestId
      } as LocationResponse);
    }

    const sanitizedLocation = LocationValidator.sanitize(location);
    
    const detectedPlatform = LocationAnalyzer.detectPlatform(req.get('User-Agent'));
    sanitizedLocation.platform = location.platform || detectedPlatform;
    
    const quality = LocationAnalyzer.analyzeQuality(sanitizedLocation);
    
    const processingTime = Date.now() - startTime;

    res.json({
      success: true,
      data: {
        received: location,
        processed: sanitizedLocation,
        quality,
        processingTime
      },
      requestId
    } as LocationResponse);

  } catch (error) {
    console.error('Location processing error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Failed to process location data',
      requestId: req.body?.requestId
    } as LocationResponse);
  }
});

export default router;