import { LocationReading } from "./location";

export interface AdaptiveContext {
  batteryLevel?: number;
  isCharging?: boolean;
  movementPattern?: 'stationary' | 'walking' | 'cycling' | 'driving' | 'erratic';
  appPriority?: 'background' | 'foreground' | 'critical';
  networkType?: 'wifi' | 'cellular' | 'offline' | 'unknown';
  environment?: 'urban' | 'highway' | 'indoor' | 'rural' | 'outdoor' | 'unknown';
  timeOfDay?: 'morning' | 'afternoon' | 'evening' | 'night';
  deviceTemperature?: 'normal' | 'warm' | 'hot';
}

export interface CurrentPipelineSettings {
  fusionAggressiveness?: 'conservative' | 'moderate' | 'aggressive';
  updateFrequency?: number;
  geofenceRadius?: number; 
  locationAccuracyThreshold?: number; 
  movementThreshold?: number; 
}

export interface OptimizationRequest {
  currentLocation: LocationReading;
  locationHistory?: LocationReading[];
  mode?: 'high_accuracy' | 'battery_saver' | 'balanced' | 'adaptive';
  context?: AdaptiveContext;
  currentPipelineSettings?: CurrentPipelineSettings;
  targetUseCase?: 'geofencing' | 'navigation' | 'tracking' | 'general';
  requestId?: string;
}

export interface FusionOptimizations {
  aggressiveness: 'conservative' | 'moderate' | 'aggressive';
  enableKalman: boolean;
  enableWeightedAveraging: boolean;
  historySize: number;
  maxHistoryAge: number;
  platformAdjustments: boolean;
}

export interface LocationOptimizations {
  updateFrequency: number; 
  accuracyThreshold: number;
  timeoutDuration: number; 
  requestHighAccuracy: boolean;
  enableBackgroundUpdates: boolean;
  batteryOptimized: boolean;
}

export interface GeofenceOptimizations {
  bufferZone: number; 
  multiCheckEnabled: boolean;
  gracePeriod: number; 
  verificationDelay: number;
  adaptiveRadius: boolean;
  batteryAwareChecks: boolean;
}

export interface MovementOptimizations {
  anomalyThreshold: number;
  speedLimits: {
    walking: number;
    cycling: number;
    driving: number;
    stationary: number;
  };
  driftTolerance: number;
  platformSpecific: boolean;
}

export interface OptimizationResult {
  recommendedMode: 'high_accuracy' | 'battery_saver' | 'balanced' | 'adaptive';
  selectedStrategy: string;
  optimizations: {
    fusion: FusionOptimizations;
    location: LocationOptimizations;
    geofence: GeofenceOptimizations;
    movement: MovementOptimizations;
  };
  reasoning: {
    modeJustification: string;
    keyFactors: string[];
    expectedBatteryImpact: 'very_low' | 'low' | 'medium' | 'high' | 'very_high';
    expectedAccuracy: number;
    expectedLatency: number;
    tradeoffAnalysis: string;
  };
  adaptiveRecommendations: {
    nextEvaluation: number;
    triggerConditions: string[]; 
    fallbackMode: 'high_accuracy' | 'battery_saver' | 'balanced';
    monitoringMetrics: string[];
  };
  contextAnalysis: {
    detectedEnvironment: string;
    estimatedMovementPattern: string;
    batteryOptimizationPotential: number; 
    accuracyRequirement: 'low' | 'medium' | 'high' | 'critical';
    riskFactors: string[];
  };
  metadata: {
    processingTime: number;
    optimizationVersion: string;
    configurationHash: string;
    lastOptimized: number;
  };
}

export interface OptimizationResponse {
  success: boolean;
  data?: OptimizationResult;
  error?: string;
  requestId?: string;
}