import { LocationReading } from "./location";

export interface MovementAnalysisRequest {
  previousLocation: LocationReading;
  currentLocation: LocationReading;
  maxReasonableSpeed?: number;
  contextHints?: {
    transportMode?: 'walking' | 'cycling' | 'driving' | 'flying' | 'stationary' | 'unknown';
    environment?: 'urban' | 'highway' | 'indoor' | 'rural' | 'outdoor' | 'unknown';
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
  metadata: {
    processingTime: number;
    maxAllowedSpeed: number;
    actualSpeedRatio: number;
  };
}

export interface MovementAnalysisResponse {
  success: boolean;
  data?: MovementAnalysisResult;
  error?: string;
  requestId?: string;
}