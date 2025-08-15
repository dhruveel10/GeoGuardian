import { LocationReading } from '../types/location';
import { 
  GeofenceDefinition, 
  GeofenceEvaluationOptions, 
  GeofenceEvaluationResult 
} from '../types/geofenceEvaluation';
import { LocationAnalyzer } from './locationAnalyzer';

export class GeofenceEvaluator {
  private static readonly EARTH_RADIUS = 6371000; // in meters
  
  private static readonly CONFIDENCE_THRESHOLDS = {
    excellent: 0.95,
    good: 0.85,
    fair: 0.70,
    poor: 0.50,
    unusable: 0.25
  };

  private static readonly DEFAULT_BUFFER_MULTIPLIERS = {
    excellent: 1.2,
    good: 1.5,
    fair: 2.0,
    poor: 3.0,
    unusable: 5.0
  };

  static evaluateGeofence(
    location: LocationReading,
    geofence: GeofenceDefinition,
    options: GeofenceEvaluationOptions = {}
  ): GeofenceEvaluationResult {
    const startTime = Date.now();

    const distance = this.calculateDistance(
      location.latitude,
      location.longitude,
      geofence.center.latitude,
      geofence.center.longitude
    );

    const distanceFromBoundary = distance - geofence.radius;

    const locationQuality = LocationAnalyzer.analyzeQuality(location);
    const qualityGrade = locationQuality.grade;

    const bufferZone = options.bufferZone || this.calculateAdaptiveBuffer(
      location.accuracy,
      qualityGrade,
      options.customBufferMultiplier
    );

    const { status, confidence } = this.determineStatus(
      distanceFromBoundary,
      bufferZone,
      location.accuracy,
      qualityGrade
    );

    const verification = this.analyzeVerificationNeeds(
      status,
      distanceFromBoundary,
      bufferZone,
      location.accuracy,
      qualityGrade
    );

    const stateTransition = this.analyzeStateTransition(
      status,
      options.previousState,
      options.previousStateTimestamp,
      options.exitGracePeriod || 30
    );

    const qualityAssessment = this.assessGeofencingQuality(
      location,
      geofence.radius,
      qualityGrade
    );

    const processingTime = Date.now() - startTime;

    return {
      status: stateTransition?.recommendedAction === 'wait' ? 'boundary_zone' : status,
      confidence: Math.round(confidence * 100) / 100,
      distance: Math.round(distance * 100) / 100,
      distanceFromBoundary: Math.round(distanceFromBoundary * 100) / 100,
      bufferZone: Math.round(bufferZone * 100) / 100,
      geofenceRadius: geofence.radius,
      verification,
      stateTransition,
      qualityAssessment,
      metadata: {
        processingTime,
        evaluationVersion: '1.0.0',
        calculationMethod: 'haversine_with_adaptive_buffering'
      }
    };
  }

  private static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const lat1Rad = (lat1 * Math.PI) / 180;
    const lat2Rad = (lat2 * Math.PI) / 180;
    const deltaLatRad = ((lat2 - lat1) * Math.PI) / 180;
    const deltaLonRad = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return this.EARTH_RADIUS * c;
  }

  private static calculateAdaptiveBuffer(
    accuracy: number,
    qualityGrade: string,
    customMultiplier?: number
  ): number {
    const baseMultiplier = this.DEFAULT_BUFFER_MULTIPLIERS[qualityGrade as keyof typeof this.DEFAULT_BUFFER_MULTIPLIERS] || 2.0;
    const multiplier = customMultiplier || baseMultiplier;
    
    const minBuffer = Math.max(accuracy * multiplier, 5); 
    const maxBuffer = Math.min(minBuffer, 200);
    
    return maxBuffer;
  }

  private static determineStatus(
    distanceFromBoundary: number,
    bufferZone: number,
    accuracy: number,
    qualityGrade: string
  ): { status: 'inside' | 'outside' | 'boundary_zone' | 'uncertain', confidence: number } {
    
    let confidence = this.CONFIDENCE_THRESHOLDS[qualityGrade as keyof typeof this.CONFIDENCE_THRESHOLDS] || 0.5;

    if (distanceFromBoundary < -bufferZone) {
      return { 
        status: 'inside', 
        confidence: Math.min(confidence, 0.95)
      };
    }

    if (distanceFromBoundary > bufferZone) {
      return { 
        status: 'outside', 
        confidence: Math.min(confidence, 0.95)
      };
    }

    if (Math.abs(distanceFromBoundary) <= bufferZone) {
      const proximityFactor = 1 - (Math.abs(distanceFromBoundary) / bufferZone);
      confidence *= (1 - proximityFactor * 0.4); 

      if (accuracy > 100) {
        return { status: 'uncertain', confidence: Math.min(confidence, 0.3) };
      }

      return { 
        status: 'boundary_zone', 
        confidence: Math.max(confidence, 0.4)
      };
    }

    return { status: 'uncertain', confidence: 0.3 };
  }

  private static analyzeVerificationNeeds(
    status: string,
    distanceFromBoundary: number,
    bufferZone: number,
    accuracy: number,
    qualityGrade: string
  ) {
    let needsSecondCheck = false;
    let recommendedDelay = 0;
    let reason = 'Location confidence sufficient';
    let suggestedAccuracy: 'high' | 'balanced' | 'battery_saver' = 'balanced';

    if (status === 'boundary_zone' || status === 'uncertain') {
      needsSecondCheck = true;
      reason = 'Location near boundary - verification recommended';
      
      if (accuracy > 50) {
        recommendedDelay = 3000; 
        suggestedAccuracy = 'high';
        reason = 'Poor GPS accuracy near boundary - high accuracy check needed';
      } else if (accuracy > 25) {
        recommendedDelay = 2000
        suggestedAccuracy = 'balanced';
        reason = 'Moderate GPS accuracy near boundary - verification needed';
      } else {
        recommendedDelay = 1000; 
        suggestedAccuracy = 'balanced';
        reason = 'Good GPS accuracy but near boundary - quick verification needed';
      }
    } else if (qualityGrade === 'poor' || qualityGrade === 'unusable') {
      needsSecondCheck = true;
      recommendedDelay = 5000;
      suggestedAccuracy = 'high';
      reason = 'Poor location quality - high accuracy verification required';
    } else if (Math.abs(distanceFromBoundary) < bufferZone * 1.5) {
      needsSecondCheck = true;
      recommendedDelay = 1500; 
      suggestedAccuracy = 'balanced';
      reason = 'Close to geofence boundary - precautionary verification';
    }

    return {
      needsSecondCheck,
      recommendedDelay,
      reason,
      suggestedAccuracy
    };
  }

  private static analyzeStateTransition(
    currentStatus: string,
    previousState?: string,
    previousStateTimestamp?: number,
    gracePeriod: number = 30
  ) {
    if (!previousState) {
      return undefined;
    }

    const now = Date.now();
    const timeSincePrevious = previousStateTimestamp ? 
      (now - previousStateTimestamp) / 1000 : 0;

    const isTransition = previousState !== currentStatus;
    let gracePeriodActive = false;
    let gracePeriodRemaining = 0;
    let recommendedAction: 'accept' | 'wait' | 'verify' = 'accept';

    if (previousState === 'inside' && 
        (currentStatus === 'outside' || currentStatus === 'boundary_zone')) {
      
      if (timeSincePrevious < gracePeriod) {
        gracePeriodActive = true;
        gracePeriodRemaining = gracePeriod - timeSincePrevious;
        recommendedAction = 'wait';
      }
    }

    if (currentStatus === 'uncertain' || currentStatus === 'boundary_zone') {
      recommendedAction = 'verify';
    }

    return {
      from: previousState as 'inside' | 'outside' | 'unknown',
      to: currentStatus as 'inside' | 'outside' | 'boundary_zone' | 'uncertain',
      isTransition,
      gracePeriodActive,
      gracePeriodRemaining: Math.round(gracePeriodRemaining * 100) / 100,
      recommendedAction
    };
  }

  private static assessGeofencingQuality(
    location: LocationReading,
    geofenceRadius: number,
    qualityGrade: string
  ) {
    const suitabilityCheck = LocationAnalyzer.isSuitableForGeofencing(location, geofenceRadius);
    
    const recommendedMinRadius = Math.max(
      location.accuracy * 2,
      qualityGrade === 'excellent' ? 10 :
      qualityGrade === 'good' ? 20 :
      qualityGrade === 'fair' ? 50 :
      qualityGrade === 'poor' ? 100 : 200
    );

    const confidenceFactors: string[] = [];
    
    if (location.accuracy <= 10) {
      confidenceFactors.push('Excellent GPS accuracy');
    } else if (location.accuracy <= 25) {
      confidenceFactors.push('Good GPS accuracy');
    } else if (location.accuracy > 50) {
      confidenceFactors.push('Poor GPS accuracy reduces confidence');
    }

    if (geofenceRadius < recommendedMinRadius) {
      confidenceFactors.push(`Geofence radius too small for GPS accuracy (min: ${Math.round(recommendedMinRadius)}m)`);
    }

    const ageMinutes = (Date.now() - location.timestamp) / (1000 * 60);
    if (ageMinutes > 2) {
      confidenceFactors.push('Location data is aging');
    }

    if (location.platform === 'web') {
      confidenceFactors.push('Web platform has reduced GPS precision');
    }

    return {
      locationQuality: qualityGrade as 'excellent' | 'good' | 'fair' | 'poor',
      suitableForGeofencing: suitabilityCheck.suitable,
      recommendedMinRadius: Math.round(recommendedMinRadius),
      confidenceFactors
    };
  }

  static validateGeofenceRequest(request: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.location) {
      errors.push('Location is required');
    }

    if (!request.geofence) {
      errors.push('Geofence definition is required');
    } else {
      if (!request.geofence.center || 
          typeof request.geofence.center.latitude !== 'number' ||
          typeof request.geofence.center.longitude !== 'number') {
        errors.push('Geofence center with valid latitude and longitude is required');
      }

      if (typeof request.geofence.radius !== 'number' || request.geofence.radius <= 0) {
        errors.push('Geofence radius must be a positive number');
      }

      if (request.geofence.radius > 10000) {
        errors.push('Geofence radius cannot exceed 10km');
      }
    }

    if (request.evaluationOptions) {
      const options = request.evaluationOptions;
      
      if (options.bufferZone !== undefined && 
          (typeof options.bufferZone !== 'number' || options.bufferZone < 0)) {
        errors.push('Buffer zone must be a non-negative number');
      }

      if (options.exitGracePeriod !== undefined && 
          (typeof options.exitGracePeriod !== 'number' || options.exitGracePeriod < 0)) {
        errors.push('Exit grace period must be a non-negative number');
      }

      if (options.previousState !== undefined && 
          !['inside', 'outside', 'unknown'].includes(options.previousState)) {
        errors.push('Previous state must be inside, outside, or unknown');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}