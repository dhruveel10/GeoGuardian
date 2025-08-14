import { LocationReading, LocationQuality } from './location';

export interface FusionOptions {
  enableWeightedAveraging?: boolean;
  enableKalmanFilter?: boolean;
  aggressiveness?: 'conservative' | 'moderate' | 'aggressive';
  maxHistoryAge?: number;
}

export interface FusionResult {
  originalLocation: LocationReading;
  fusedLocation: LocationReading;
  appliedCorrections: string[];
  confidenceImprovement: number;
  fusionMetadata: {
    algorithmUsed: string;
    locationsUsed: number;
    weightDistribution?: number[];
    kalmanGain?: number;
    estimatedVelocity?: { lat: number; lon: number };
    processingTime?: number;
  };
}

export interface FusionRequest {
  currentLocation: LocationReading;
  locationHistory?: LocationReading[];
  fusionOptions?: FusionOptions;
  requestId?: string;
  userAgent?: string;
}

export interface FusionResponse {
  success: boolean;
  data?: {
    original: {
      location: LocationReading;
      quality: LocationQuality;
    };
    fused: {
      location: LocationReading;
      quality: LocationQuality;
    };
    fusion: {
      appliedCorrections: string[];
      confidenceImprovement: number;
      metadata: {
        algorithmUsed: string;
        locationsUsed: number;
        weightDistribution?: number[];
        kalmanGain?: number;
        estimatedVelocity?: { lat: number; lon: number };
      };
    };
    comparison: {
      accuracyImprovement: number;
      distanceShift: number;
      processingTime: number;
    };
  };
  error?: string;
  requestId?: string;
}

export interface ComparisonRequest {
  currentLocation: LocationReading;
  locationHistory?: LocationReading[];
  fusionOptions?: FusionOptions;
  requestId?: string;
}

export interface ComparisonResponse {
  success: boolean;
  data?: {
    raw: {
      location: LocationReading;
      quality: LocationQuality;
      movementAnalysis?: any;
    };
    fused: {
      location: LocationReading;
      quality: LocationQuality;
      movementAnalysis?: any;
    };
    improvements: {
      accuracyGain: number;
      qualityScoreGain: number;
      confidenceGain: number;
      recommendationsReduced: number;
    };
    visualComparison: {
      distanceShift: number;
      accuracyRadiusChange: number;
      platformOptimizations: string[];
    };
  };
  error?: string;
  requestId?: string;
}