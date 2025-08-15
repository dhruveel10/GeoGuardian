import { LocationReading } from "./location";

export interface GeofenceDefinition {
  center: {
    latitude: number;
    longitude: number;
  };
  radius: number;
  id?: string;
  name?: string;
}

export interface GeofenceEvaluationOptions {
  bufferZone?: number; 
  requireMultiCheck?: boolean;
  exitGracePeriod?: number; 
  previousState?: 'inside' | 'outside' | 'unknown';
  previousStateTimestamp?: number;
  customBufferMultiplier?: number;
}

export interface GeofenceEvaluationRequest {
  location: LocationReading;
  geofence: GeofenceDefinition;
  evaluationOptions?: GeofenceEvaluationOptions;
  requestId?: string;
  metadata?: {
    userAgent?: string;
    deviceInfo?: any;
  };
}

export interface GeofenceEvaluationResult {
  status: 'inside' | 'outside' | 'boundary_zone' | 'uncertain';
  confidence: number;
  distance: number; // distance from geofence center
  distanceFromBoundary: number; // distance from geofence boundary (negative = inside)
  bufferZone: number;
  geofenceRadius: number;
  verification: {
    needsSecondCheck: boolean;
    recommendedDelay: number; // milliseconds
    reason: string;
    suggestedAccuracy?: 'high' | 'balanced' | 'battery_saver';
  };
  stateTransition?: {
    from: 'inside' | 'outside' | 'unknown';
    to: 'inside' | 'outside' | 'boundary_zone' | 'uncertain';
    isTransition: boolean;
    gracePeriodActive: boolean;
    gracePeriodRemaining: number; // seconds
    recommendedAction: 'accept' | 'wait' | 'verify';
  };
  qualityAssessment: {
    locationQuality: 'excellent' | 'good' | 'fair' | 'poor';
    suitableForGeofencing: boolean;
    recommendedMinRadius: number;
    confidenceFactors: string[];
  };
  metadata: {
    processingTime: number;
    evaluationVersion: string;
    calculationMethod: string;
  };
}

export interface GeofenceEvaluationResponse {
  success: boolean;
  data?: GeofenceEvaluationResult;
  error?: string;
  requestId?: string;
}