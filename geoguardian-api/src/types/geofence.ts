import { LocationReading, LocationQuality } from './location';
import { MovementAnalysisResult } from './movementAnalysis';

export interface Geofence {
  id: string;
  name?: string;
  center: { latitude: number; longitude: number };
  radius: number;
  metadata?: {
    type?: 'building' | 'parking' | 'campus' | 'delivery' | 'custom';
    priority?: 'high' | 'medium' | 'low';
    minDwellTime?: number;
    exitGracePeriod?: number;
    aiOptimized?: boolean;
    aiReasoning?: string;
    aiConfidence?: number;
    recommendedBufferStrategy?: 'conservative' | 'moderate' | 'aggressive';
  };
}

export interface GeofenceState {
  geofenceId: string;
  status: 'inside' | 'outside' | 'uncertain' | 'approaching' | 'leaving';
  consecutiveOutsideCount: number;
  dwellTimeInside: number;
  lastTransitionTime: number;
  entryTime?: number;
  exitTime?: number;
}

export interface GeofenceEvaluationOptions {
  enableAutoFusion?: boolean;
  bufferStrategy?: 'conservative' | 'moderate' | 'aggressive';
  requireHighAccuracy?: boolean;
  movementContext?: 'stationary' | 'walking' | 'driving';
  platformOverride?: 'ios' | 'android' | 'web' | 'unknown';
}

export interface GeofenceEvaluationRequest {
  currentLocation: LocationReading;
  geofences: Geofence[];
  locationHistory?: LocationReading[];
  previousStates?: GeofenceState[];
  options?: GeofenceEvaluationOptions;
  requestId?: string;
}

export interface GeofenceZones {
  innerRadius: number;
  outerRadius: number;
  bufferSize: number;
  platformAdjusted: boolean;
}

export interface GeofencePlatformAnalysis {
  baseBuffer: number;
  platformMultiplier: number;
  finalBuffer: number;
  confidenceAdjustment: number;
  platformSpecificFactors: string[];
}

export interface GeofenceLocationQuality {
  accuracy: number;
  platform: string;
  qualityGrade: string;
  fusionApplied: boolean;
  movementAnalyzed: boolean;
}

export interface GeofenceStateHistory {
  previousStatus?: string;
  consecutiveOutsideCount: number;
  dwellTimeInside: number;
  lastTransitionTime?: number;
}

export interface GeofenceNextActions {
  suggestedWaitTime?: number;
  highAccuracyThreshold: number;
  alternativeApproaches: string[];
}

export interface GeofenceDebugInfo {
  distanceToCenter: number;
  geofenceRadius: number;
  zones: GeofenceZones;
  locationQuality: GeofenceLocationQuality;
  stateHistory: GeofenceStateHistory;
  platformAnalysis: GeofencePlatformAnalysis;
  nextActions: GeofenceNextActions;
}

export interface GeofenceEvaluationResult {
  geofenceId: string;
  status: 'inside' | 'outside' | 'uncertain' | 'approaching' | 'leaving';
  confidence: number;
  triggered: 'entry' | 'exit' | 'none';
  recommendation: 'continue' | 'request_high_accuracy' | 'wait' | 'fusion_needed';
  debugInfo: GeofenceDebugInfo;
}

export interface GeofenceEvaluationResponse {
  success: boolean;
  data?: {
    evaluations: GeofenceEvaluationResult[];
    globalRecommendation: 'continue' | 'request_high_accuracy' | 'wait' | 'fusion_needed';
    updatedStates: GeofenceState[];
    summary: {
      totalGeofences: number;
      activeGeofences: number;
      triggeredEvents: number;
      highestConfidence: number;
      lowestConfidence: number;
      processingTime: number;
    };
  };
  error?: string;
  requestId?: string;
}

export interface GeofenceValidationResult {
  isValid: boolean;
  errors: string[];
}

export interface GeofenceBufferSettings {
  conservative: { multiplier: number; maxRatio: number; minBuffer: number };
  moderate: { multiplier: number; maxRatio: number; minBuffer: number };
  aggressive: { multiplier: number; maxRatio: number; minBuffer: number };
}

export interface GeofencePlatformSettings {
  ios: {
    bufferMultiplier: number;
    confidenceBoost: number;
    speedThreshold: number;
    graceMultiplier: number;
  };
  android: {
    bufferMultiplier: number;
    confidenceBoost: number;
    speedThreshold: number;
    graceMultiplier: number;
  };
  web: {
    bufferMultiplier: number;
    confidenceBoost: number;
    speedThreshold: number;
    graceMultiplier: number;
  };
  unknown: {
    bufferMultiplier: number;
    confidenceBoost: number;
    speedThreshold: number;
    graceMultiplier: number;
  };
}