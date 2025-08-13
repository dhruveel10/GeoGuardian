import { LocationReading } from "./location";

export interface MovementAnalysisResponse {
  success: boolean;
  data?: MovementAnalysisResult;
  error?: string;
  requestId?: string;
}

export interface MovementAnalysisRequest {
  previousLocation: LocationReading;
  currentLocation: LocationReading;
  maxReasonableSpeed?: number;
  contextHints?: {
    transportMode?: 'walking' | 'cycling' | 'driving' | 'flying' | 'stationary' | 'unknown';
    environment?: 'urban' | 'highway' | 'indoor' | 'rural' | 'outdoor' | 'unknown';
  };
  deviceInfo?: {
    platform?: 'ios' | 'android' | 'web' | 'unknown';
    osVersion?: string;
    batteryLevel?: number;
    connectionType?: string;
    userAgent?: string;
  };
  requestId?: string;
}

export interface MovementAnalysisResult {
  accepted: boolean;
  distance: number;
  timeElapsed: number;
  impliedSpeed: number;
  speedUnit: 'km/h' | 'mph' | 'm/s';
  anomalyType?: 'impossible_speed' | 'teleportation' | 'gps_jump' | 'time_inconsistency' | 'gps_drift';
  confidence: number;
  reason: string;
  recommendation: string;
  platformAnalysis: {
    detectedPlatform: string;
    platformSpecificIssues: string[];
    platformAdjustments: string[];
  };
  qualityFactors: {
    signalQuality: 'excellent' | 'good' | 'fair' | 'poor';
    consistency: number;
    environmentSuitability: number;
    overallReliability: number;
  };
  contextualInsights: {
    movementPattern: 'stationary' | 'slow' | 'moderate' | 'fast' | 'erratic';
    environmentalFactors: string[];
    recommendations: string[];
  };
  metadata: {
    processingTime: number;
    maxAllowedSpeed: number;
    actualSpeedRatio: number;
    analysisVersion: string;
    riskLevel: 'low' | 'medium' | 'high';
  };
}