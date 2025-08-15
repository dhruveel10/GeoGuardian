import { LocationReading } from '../types/location';
import { 
  AdaptiveContext, 
  CurrentPipelineSettings, 
  OptimizationResult,
  FusionOptimizations,
  LocationOptimizations,
  GeofenceOptimizations,
  MovementOptimizations
} from '../types/adaptiveOptimization';
import { LocationAnalyzer } from './locationAnalyzer';
import { MovementAnomalyAnalyzer } from './movementAnomalyAnalyzer';

export class AdaptiveOptimizer {
  private static readonly MODE_PRESETS = {
    high_accuracy: {
      description: 'Maximum accuracy with high battery usage',
      batteryImpact: 'very_high' as const,
      accuracyTarget: 5,
      updateFrequency: 5,
      priority: 'accuracy'
    },
    battery_saver: {
      description: 'Optimized for battery life with reduced accuracy',
      batteryImpact: 'low' as const,
      accuracyTarget: 50,
      updateFrequency: 60,
      priority: 'battery'
    },
    balanced: {
      description: 'Good balance between accuracy and battery life',
      batteryImpact: 'medium' as const,
      accuracyTarget: 20,
      updateFrequency: 15,
      priority: 'balanced'
    },
    adaptive: {
      description: 'Automatically adjusts based on context',
      batteryImpact: 'medium' as const,
      accuracyTarget: 15, 
      updateFrequency: 20,
      priority: 'context_aware'
    }
  };

  private static readonly CONTEXT_WEIGHTS = {
    batteryLevel: 0.3,
    movementPattern: 0.25,
    appPriority: 0.2,
    environment: 0.15,
    networkType: 0.1
  };

  static optimizePipeline(
    currentLocation: LocationReading,
    locationHistory: LocationReading[] = [],
    mode: string = 'adaptive',
    context: AdaptiveContext = {},
    currentSettings: CurrentPipelineSettings = {},
    targetUseCase: string = 'geofencing'
  ): OptimizationResult {
    const startTime = Date.now();

    const contextAnalysis = this.analyzeContext(currentLocation, locationHistory, context);
    
    const selectedMode = mode === 'adaptive' ? 
      this.selectOptimalMode(contextAnalysis, targetUseCase) : mode;

    const fusionOptimizations = this.optimizeFusion(
      selectedMode, contextAnalysis, currentSettings
    );

    const locationOptimizations = this.optimizeLocation(
      selectedMode, contextAnalysis, currentSettings
    );

    const geofenceOptimizations = this.optimizeGeofence(
      selectedMode, contextAnalysis, currentSettings, targetUseCase
    );

    const movementOptimizations = this.optimizeMovement(
      selectedMode, contextAnalysis, currentSettings
    );

    const reasoning = this.generateReasoning(
      selectedMode, contextAnalysis, targetUseCase
    );

    const adaptiveRecommendations = this.generateAdaptiveRecommendations(
      selectedMode, contextAnalysis, reasoning
    );

    const processingTime = Date.now() - startTime;

    return {
      recommendedMode: selectedMode as any,
      selectedStrategy: this.getStrategyDescription(selectedMode, contextAnalysis),
      optimizations: {
        fusion: fusionOptimizations,
        location: locationOptimizations,
        geofence: geofenceOptimizations,
        movement: movementOptimizations
      },
      reasoning,
      adaptiveRecommendations,
      contextAnalysis,
      metadata: {
        processingTime,
        optimizationVersion: '1.0.0',
        configurationHash: this.generateConfigHash(selectedMode, context),
        lastOptimized: Date.now()
      }
    };
  }

  private static analyzeContext(
    currentLocation: LocationReading,
    locationHistory: LocationReading[],
    context: AdaptiveContext
  ) {
    const locationQuality = LocationAnalyzer.analyzeQuality(currentLocation);
    
    let estimatedMovementPattern = context.movementPattern || 'unknown';
    if (locationHistory.length > 0 && !context.movementPattern) {
      estimatedMovementPattern = this.detectMovementPattern(locationHistory, currentLocation);
    }

    const detectedEnvironment = context.environment || this.detectEnvironment(
      currentLocation, locationQuality
    );

    const batteryOptimizationPotential = this.calculateBatteryOptimizationPotential(context);

    const accuracyRequirement = this.determineAccuracyRequirement(
      context, estimatedMovementPattern, detectedEnvironment
    );

    const riskFactors = this.identifyRiskFactors(
      currentLocation, context, locationQuality
    );

    return {
      detectedEnvironment,
      estimatedMovementPattern,
      batteryOptimizationPotential,
      accuracyRequirement,
      riskFactors
    };
  }

  private static selectOptimalMode(contextAnalysis: any, targetUseCase: string): string {
    let score = {
      high_accuracy: 0,
      battery_saver: 0,
      balanced: 0
    };

    const batteryLevel = contextAnalysis.batteryOptimizationPotential;
    if (batteryLevel < 0.2) {
      score.battery_saver += 40;
      score.balanced += 20;
    } else if (batteryLevel < 0.5) {
      score.battery_saver += 20;
      score.balanced += 30;
      score.high_accuracy += 10;
    } else {
      score.high_accuracy += 30;
      score.balanced += 25;
    }

    if (contextAnalysis.accuracyRequirement === 'critical') {
      score.high_accuracy += 50;
    } else if (contextAnalysis.accuracyRequirement === 'high') {
      score.high_accuracy += 30;
      score.balanced += 20;
    } else if (contextAnalysis.accuracyRequirement === 'low') {
      score.battery_saver += 30;
      score.balanced += 20;
    }

    if (contextAnalysis.estimatedMovementPattern === 'stationary') {
      score.battery_saver += 25;
    } else if (contextAnalysis.estimatedMovementPattern === 'driving') {
      score.high_accuracy += 25;
    }

    if (contextAnalysis.detectedEnvironment === 'indoor') {
      score.battery_saver += 20; 
    } else if (contextAnalysis.detectedEnvironment === 'urban') {
      score.high_accuracy += 15;
    }

    if (targetUseCase === 'geofencing') {
      score.balanced += 15;
    } else if (targetUseCase === 'navigation') {
      score.high_accuracy += 25;
    }

    const maxScore = Math.max(...Object.values(score));
    const optimalMode = Object.keys(score).find(
      mode => score[mode as keyof typeof score] === maxScore
    ) || 'balanced';

    return optimalMode;
  }

  private static optimizeFusion(
    mode: string,
    contextAnalysis: any,
    currentSettings: CurrentPipelineSettings
  ): FusionOptimizations {
    const preset = this.MODE_PRESETS[mode as keyof typeof this.MODE_PRESETS] || this.MODE_PRESETS.balanced;

    let aggressiveness: 'conservative' | 'moderate' | 'aggressive' = 'moderate';
    let enableKalman = true;
    let enableWeightedAveraging = true;
    let historySize = 5;
    let maxHistoryAge = 300; 
    let platformAdjustments = true;

    if (mode === 'high_accuracy') {
      aggressiveness = 'aggressive';
      historySize = 7;
      maxHistoryAge = 180; 
    } else if (mode === 'battery_saver') {
      aggressiveness = 'conservative';
      enableKalman = false;
      historySize = 3;
      maxHistoryAge = 600; 
    }

    if (contextAnalysis.detectedEnvironment === 'indoor') {
      aggressiveness = 'aggressive'; 
      historySize = Math.min(historySize + 2, 8);
    }

    if (contextAnalysis.estimatedMovementPattern === 'stationary') {
      enableKalman = false; 
      aggressiveness = 'aggressive'
    } else if (contextAnalysis.estimatedMovementPattern === 'driving') {
      enableKalman = true;
      historySize = Math.min(historySize + 1, 6);
    }

    if (contextAnalysis.riskFactors.includes('poor_signal')) {
      aggressiveness = 'aggressive';
      historySize = Math.min(historySize + 2, 8);
    }

    return {
      aggressiveness,
      enableKalman,
      enableWeightedAveraging,
      historySize,
      maxHistoryAge,
      platformAdjustments
    };
  }

  private static optimizeLocation(
    mode: string,
    contextAnalysis: any,
    currentSettings: CurrentPipelineSettings
  ): LocationOptimizations {
    const preset = this.MODE_PRESETS[mode as keyof typeof this.MODE_PRESETS] || this.MODE_PRESETS.balanced;

    let updateFrequency = preset.updateFrequency;
    let accuracyThreshold = preset.accuracyTarget;
    let timeoutDuration = 30000;
    let requestHighAccuracy = mode === 'high_accuracy';
    let enableBackgroundUpdates = true;
    let batteryOptimized = mode === 'battery_saver';

    if (contextAnalysis.estimatedMovementPattern === 'stationary') {
      updateFrequency = Math.max(updateFrequency * 2, 30); 
      batteryOptimized = true;
    } else if (contextAnalysis.estimatedMovementPattern === 'driving') {
      updateFrequency = Math.min(updateFrequency / 2, 5);
      requestHighAccuracy = true;
    }

    if (contextAnalysis.detectedEnvironment === 'indoor') {
      accuracyThreshold *= 2;
      timeoutDuration = 45000;
    } else if (contextAnalysis.detectedEnvironment === 'urban') {
      requestHighAccuracy = true;
      timeoutDuration = 20000;
    }

    if (contextAnalysis.batteryOptimizationPotential < 0.2) {
      updateFrequency = Math.max(updateFrequency * 3, 60);
      requestHighAccuracy = false;
      batteryOptimized = true;
      enableBackgroundUpdates = false;
    }

    return {
      updateFrequency,
      accuracyThreshold,
      timeoutDuration,
      requestHighAccuracy,
      enableBackgroundUpdates,
      batteryOptimized
    };
  }

  private static optimizeGeofence(
    mode: string,
    contextAnalysis: any,
    currentSettings: CurrentPipelineSettings,
    targetUseCase: string
  ): GeofenceOptimizations {
    let bufferZone = 15;
    let multiCheckEnabled = true;
    let gracePeriod = 30;
    let verificationDelay = 2000;
    let adaptiveRadius = mode === 'adaptive';
    let batteryAwareChecks = mode === 'battery_saver';

    if (mode === 'high_accuracy') {
      bufferZone = 10;
      multiCheckEnabled = true;
      gracePeriod = 15;
      verificationDelay = 1000;
    } else if (mode === 'battery_saver') {
      bufferZone = 30;
      multiCheckEnabled = false;
      gracePeriod = 60;
      verificationDelay = 5000;
      batteryAwareChecks = true;
    }

    if (contextAnalysis.detectedEnvironment === 'indoor') {
      bufferZone *= 2;
      multiCheckEnabled = true;
      gracePeriod *= 1.5;
    } else if (contextAnalysis.detectedEnvironment === 'urban') {
      multiCheckEnabled = true;
      verificationDelay = 1500;
    }

    if (contextAnalysis.estimatedMovementPattern === 'stationary') {
      bufferZone = Math.max(bufferZone * 0.7, 8);
      gracePeriod *= 2;
    } else if (contextAnalysis.estimatedMovementPattern === 'driving') {
      bufferZone = Math.min(bufferZone * 1.5, 50);
      gracePeriod = Math.max(gracePeriod * 0.5, 10);
    }

    if (contextAnalysis.accuracyRequirement === 'critical') {
      multiCheckEnabled = true;
      verificationDelay = 500;
      gracePeriod = Math.max(gracePeriod * 0.5, 5);
    }

    return {
      bufferZone: Math.round(bufferZone),
      multiCheckEnabled,
      gracePeriod,
      verificationDelay,
      adaptiveRadius,
      batteryAwareChecks
    };
  }

  private static optimizeMovement(
    mode: string,
    contextAnalysis: any,
    currentSettings: CurrentPipelineSettings
  ): MovementOptimizations {
    let anomalyThreshold = 0.7;
    let speedLimits = {
      walking: 15,
      cycling: 40,
      driving: 200,
      stationary: 0.5
    };
    let driftTolerance = 15; 
    let platformSpecific = true;

    if (mode === 'high_accuracy') {
      anomalyThreshold = 0.9;
      driftTolerance = 10;
    } else if (mode === 'battery_saver') {
      anomalyThreshold = 0.5;
      driftTolerance = 25;
    }

    if (contextAnalysis.detectedEnvironment === 'indoor') {
      driftTolerance *= 2; 
      speedLimits.walking = 8;
      speedLimits.cycling = 15;
    } else if (contextAnalysis.detectedEnvironment === 'highway') {
      speedLimits.driving = 250;
    }

    if (contextAnalysis.estimatedMovementPattern === 'stationary') {
      driftTolerance = Math.min(driftTolerance, 10);
      anomalyThreshold = 0.8;
    }

    return {
      anomalyThreshold,
      speedLimits,
      driftTolerance,
      platformSpecific
    };
  }

  private static generateReasoning(
    selectedMode: string,
    contextAnalysis: any,
    targetUseCase: string
  ) {
    const preset = this.MODE_PRESETS[selectedMode as keyof typeof this.MODE_PRESETS] || this.MODE_PRESETS.balanced;
    
    const keyFactors: string[] = [];
    let modeJustification = `Selected ${selectedMode} mode: ${preset.description}`;

    if (contextAnalysis.batteryOptimizationPotential < 0.3) {
      keyFactors.push('Low battery level detected');
    }

    if (contextAnalysis.accuracyRequirement === 'critical') {
      keyFactors.push('Critical accuracy requirement');
    }

    if (contextAnalysis.estimatedMovementPattern === 'stationary') {
      keyFactors.push('Stationary movement pattern detected');
    } else if (contextAnalysis.estimatedMovementPattern === 'driving') {
      keyFactors.push('High-speed movement detected');
    }

    if (contextAnalysis.detectedEnvironment === 'indoor') {
      keyFactors.push('Indoor environment with reduced GPS accuracy');
    }

    if (contextAnalysis.riskFactors.length > 0) {
      keyFactors.push(`Risk factors: ${contextAnalysis.riskFactors.join(', ')}`);
    }

    let expectedAccuracy = preset.accuracyTarget;
    if (contextAnalysis.detectedEnvironment === 'indoor') {
      expectedAccuracy *= 2;
    }
    if (contextAnalysis.riskFactors.includes('poor_signal')) {
      expectedAccuracy *= 1.5;
    }

    const expectedLatency = selectedMode === 'high_accuracy' ? 1500 :
                           selectedMode === 'battery_saver' ? 5000 : 2500;

    let tradeoffAnalysis = '';
    if (selectedMode === 'high_accuracy') {
      tradeoffAnalysis = 'Prioritizing accuracy over battery life. Expect higher power consumption but best location precision.';
    } else if (selectedMode === 'battery_saver') {
      tradeoffAnalysis = 'Prioritizing battery life over accuracy. Expect reduced power consumption with acceptable location precision.';
    } else {
      tradeoffAnalysis = 'Balanced approach providing good accuracy while managing battery consumption effectively.';
    }

    return {
      modeJustification,
      keyFactors,
      expectedBatteryImpact: preset.batteryImpact,
      expectedAccuracy: Math.round(expectedAccuracy),
      expectedLatency,
      tradeoffAnalysis
    };
  }

  private static generateAdaptiveRecommendations(
    selectedMode: string,
    contextAnalysis: any,
    reasoning: any
  ) {
    const nextEvaluation = selectedMode === 'high_accuracy' ? 300 :
                          selectedMode === 'battery_saver' ? 1800 :
                          900; 

    const triggerConditions: string[] = [
      'Battery level changes by more than 20%',
      'Movement pattern changes',
      'Environment changes (indoor/outdoor)',
      'Location accuracy degrades significantly'
    ];

    if (contextAnalysis.batteryOptimizationPotential < 0.2) {
      triggerConditions.push('Battery level increases above 30%');
    }

    const fallbackMode = contextAnalysis.batteryOptimizationPotential < 0.1 ? 
                        'battery_saver' : 'balanced';

    const monitoringMetrics = [
      'GPS accuracy trends',
      'Battery consumption rate',
      'Location update frequency',
      'Geofence transition reliability'
    ];

    return {
      nextEvaluation,
      triggerConditions,
      fallbackMode: fallbackMode as 'high_accuracy' | 'battery_saver' | 'balanced',
      monitoringMetrics
    };
  }

  private static detectMovementPattern(
    locationHistory: LocationReading[],
    currentLocation: LocationReading
  ): string {
    if (locationHistory.length < 2) return 'unknown';

    const distances: number[] = [];
    const speeds: number[] = [];

    for (let i = 1; i < locationHistory.length; i++) {
      const result = MovementAnomalyAnalyzer.analyzeMovement({
        previousLocation: locationHistory[i - 1],
        currentLocation: locationHistory[i]
      });
      distances.push(result.distance);
      speeds.push(result.impliedSpeed);
    }

    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const maxDistance = Math.max(...distances);

    if (avgSpeed < 2 && maxDistance < 10) return 'stationary';
    if (avgSpeed < 8) return 'walking';
    if (avgSpeed < 25) return 'cycling';
    if (avgSpeed < 120) return 'driving';
    return 'erratic';
  }

  private static detectEnvironment(
    location: LocationReading,
    quality: any
  ): string {
    if (location.accuracy > 100) return 'indoor';
    if (location.accuracy > 50 && quality.grade === 'poor') return 'urban';
    if (location.speed && location.speed > 50) return 'highway';
    if (location.accuracy < 10) return 'outdoor';
    return 'unknown';
  }

  private static calculateBatteryOptimizationPotential(context: AdaptiveContext): number {
    if (!context.batteryLevel) return 0.5;
    
    let potential = context.batteryLevel / 100;
    
    if (context.isCharging) potential += 0.3;
    if (context.appPriority === 'background') potential -= 0.2;
    if (context.deviceTemperature === 'hot') potential -= 0.1;
    
    return Math.max(0, Math.min(1, potential));
  }

  private static determineAccuracyRequirement(
    context: AdaptiveContext,
    movementPattern: string,
    environment: string
  ): 'low' | 'medium' | 'high' | 'critical' {
    if (context.appPriority === 'critical') return 'critical';
    if (movementPattern === 'driving' && environment === 'highway') return 'high';
    if (environment === 'urban') return 'high';
    if (movementPattern === 'stationary') return 'medium';
    if (environment === 'indoor') return 'low';
    return 'medium';
  }

  private static identifyRiskFactors(
    location: LocationReading,
    context: AdaptiveContext,
    quality: any
  ): string[] {
    const risks: string[] = [];
    
    if (quality.grade === 'poor' || quality.grade === 'unusable') {
      risks.push('poor_signal');
    }
    
    if (location.accuracy > 50) {
      risks.push('high_uncertainty');
    }
    
    if (context.batteryLevel && context.batteryLevel < 15) {
      risks.push('critical_battery');
    }
    
    if (context.networkType === 'offline') {
      risks.push('no_network');
    }
    
    if (context.deviceTemperature === 'hot') {
      risks.push('thermal_throttling');
    }
    
    const ageMinutes = (Date.now() - location.timestamp) / (1000 * 60);
    if (ageMinutes > 5) {
      risks.push('stale_location');
    }
    
    return risks;
  }

  private static getStrategyDescription(selectedMode: string, contextAnalysis: any): string {
    const base = this.MODE_PRESETS[selectedMode as keyof typeof this.MODE_PRESETS]?.description || 'Unknown mode';
    const context = contextAnalysis.detectedEnvironment !== 'unknown' ? 
                   ` optimized for ${contextAnalysis.detectedEnvironment} environment` : '';
    const movement = contextAnalysis.estimatedMovementPattern !== 'unknown' ? 
                    ` with ${contextAnalysis.estimatedMovementPattern} movement pattern` : '';
    
    return `${base}${context}${movement}`;
  }

  private static generateConfigHash(mode: string, context: AdaptiveContext): string {
    const hashInput = JSON.stringify({ mode, context });
    let hash = 0;
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; 
    }
    return Math.abs(hash).toString(16);
  }

  static validateOptimizationRequest(request: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!request.currentLocation) {
      errors.push('Current location is required');
    }

    if (request.mode && !['high_accuracy', 'battery_saver', 'balanced', 'adaptive'].includes(request.mode)) {
      errors.push('Mode must be one of: high_accuracy, battery_saver, balanced, adaptive');
    }

    if (request.context) {
      const context = request.context;
      
      if (context.batteryLevel !== undefined && 
          (typeof context.batteryLevel !== 'number' || context.batteryLevel < 0 || context.batteryLevel > 100)) {
        errors.push('Battery level must be a number between 0 and 100');
      }

      if (context.appPriority !== undefined && 
          !['background', 'foreground', 'critical'].includes(context.appPriority)) {
        errors.push('App priority must be background, foreground, or critical');
      }

      if (context.networkType !== undefined && 
          !['wifi', 'cellular', 'offline', 'unknown'].includes(context.networkType)) {
        errors.push('Network type must be wifi, cellular, offline, or unknown');
      }
    }

    if (request.targetUseCase !== undefined && 
        !['geofencing', 'navigation', 'tracking', 'general'].includes(request.targetUseCase)) {
      errors.push('Target use case must be geofencing, navigation, tracking, or general');
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }
}