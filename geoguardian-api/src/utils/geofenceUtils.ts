import { LocationReading } from '../types/location';
import { 
  Geofence, 
  GeofenceState, 
  GeofenceEvaluationOptions, 
  GeofenceZones,
  GeofencePlatformSettings,
  GeofenceBufferSettings,
  GeofenceValidationResult,
  GeofenceEvaluationResult
} from '../types/geofence';
import { LocationAI } from './locationAI';

export class GeofenceUtils {
  private static ai = LocationAI.getInstance();

  private static readonly PLATFORM_SETTINGS: GeofencePlatformSettings = {
    ios: {
      bufferMultiplier: 0.8,
      confidenceBoost: 1.2,
      speedThreshold: 50,
      graceMultiplier: 0.8
    },
    android: {
      bufferMultiplier: 1.0,
      confidenceBoost: 1.0,
      speedThreshold: 40,
      graceMultiplier: 1.0
    },
    web: {
      bufferMultiplier: 1.4,
      confidenceBoost: 0.7,
      speedThreshold: 30,
      graceMultiplier: 1.5
    },
    unknown: {
      bufferMultiplier: 1.2,
      confidenceBoost: 0.8,
      speedThreshold: 35,
      graceMultiplier: 1.2
    }
  };

  private static readonly BUFFER_SETTINGS: GeofenceBufferSettings = {
    conservative: { multiplier: 1.2, maxRatio: 0.3, minBuffer: 15 },
    moderate: { multiplier: 1.5, maxRatio: 0.4, minBuffer: 20 },
    aggressive: { multiplier: 2.0, maxRatio: 0.5, minBuffer: 25 }
  };

  static async optimizeGeofenceWithAI(
    geofence: Geofence,
    environment: string,
    issues?: string[]
  ): Promise<Geofence> {
    try {
      const optimization = await this.ai.optimizeGeofence(geofence, environment, issues);
      
      return {
        ...geofence,
        radius: optimization.recommendedRadius,
        metadata: {
          ...geofence.metadata,
          aiOptimized: true,
          aiReasoning: optimization.reasoning,
          aiConfidence: optimization.confidence,
          recommendedBufferStrategy: optimization.bufferStrategy
        }
      };
    } catch (error) {
      console.warn('AI geofence optimization failed:', error);
      return geofence;
    }
  }
  
  static async evaluateGeofenceWithAI(
    geofence: Geofence,
    location: LocationReading,
    options: GeofenceEvaluationOptions,
    previousStates?: GeofenceState[]
  ): Promise<GeofenceEvaluationResult> {
    const standardResult = this.evaluateGeofenceStandard(geofence, location, options, previousStates);
    
    if (standardResult.confidence < 0.6) {
      try {
        const environment = this.inferEnvironment(location, geofence);
        const issues = this.identifyGeofenceIssues(standardResult, location);
        
        const optimizedGeofence = await this.optimizeGeofenceWithAI(geofence, environment, issues);
        
        if (optimizedGeofence.radius !== geofence.radius) {
          const newResult = this.evaluateGeofenceStandard(optimizedGeofence, location, options, previousStates);
          
          if (newResult.confidence > standardResult.confidence) {
            newResult.debugInfo.platformAnalysis.platformSpecificFactors.push(
              `AI optimization improved confidence from ${standardResult.confidence.toFixed(2)} to ${newResult.confidence.toFixed(2)}`
            );
            return newResult;
          }
        }
      } catch (error) {
        console.warn('AI geofence evaluation failed:', error);
      }
    }
    
    return standardResult;
  }
  
  private static evaluateGeofenceStandard(
    geofence: Geofence,
    location: LocationReading,
    options: GeofenceEvaluationOptions,
    previousStates?: GeofenceState[]
  ): GeofenceEvaluationResult {
    const previousState = previousStates?.find(s => s.geofenceId === geofence.id);
    
    const distance = this.calculateDistance(
      location.latitude,
      location.longitude,
      geofence.center.latitude,
      geofence.center.longitude
    );
  
    const zones = this.calculateGeofenceZones(geofence, location, options);
    const status = this.determineGeofenceStatus(distance, zones, previousState);
    const confidence = this.calculateConfidence(distance, zones, location, options);
    const dwellTime = previousState ? previousState.dwellTimeInside : 0;
    const triggered = this.determineTriggeredEvent(status, previousState, geofence, dwellTime);
    const recommendation = this.generateRecommendation(status, confidence, location, zones, options);
  
    return {
      geofenceId: geofence.id,
      status: status as any,
      confidence,
      triggered: triggered as any,
      recommendation: recommendation as any,
      debugInfo: {
        distanceToCenter: distance,
        geofenceRadius: geofence.radius,
        zones,
        locationQuality: {
          accuracy: location.accuracy,
          platform: location.platform || 'unknown',
          qualityGrade: 'good',
          fusionApplied: false,
          movementAnalyzed: false
        },
        stateHistory: {
          previousStatus: previousState?.status,
          consecutiveOutsideCount: previousState?.consecutiveOutsideCount || 0,
          dwellTimeInside: dwellTime
        },
        platformAnalysis: {
          baseBuffer: zones.bufferSize,
          platformMultiplier: 1.0,
          finalBuffer: zones.bufferSize,
          confidenceAdjustment: 1.0,
          platformSpecificFactors: []
        },
        nextActions: {
          highAccuracyThreshold: zones.bufferSize * 0.5,
          alternativeApproaches: []
        }
      }
    };
  }
  
  private static inferEnvironment(location: LocationReading, geofence: Geofence): string {
    if (location.accuracy > 100) return 'indoor';
    if (location.accuracy > 50) return 'urban';
    if (geofence.radius > 500) return 'outdoor';
    return 'urban';
  }
  
  private static identifyGeofenceIssues(result: GeofenceEvaluationResult, location: LocationReading): string[] {
    const issues: string[] = [];
    
    if (result.confidence < 0.5) {
      issues.push('Low confidence geofence evaluation');
    }
    
    if (location.accuracy > result.debugInfo.geofenceRadius * 0.5) {
      issues.push('GPS accuracy poor relative to geofence size');
    }
    
    if (result.status === 'uncertain') {
      issues.push('Location in uncertainty zone');
    }
    
    return issues;
  }

  static calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  static calculateGeofenceZones(
    geofence: Geofence,
    location: LocationReading,
    options: GeofenceEvaluationOptions
  ): GeofenceZones {
    const platform = options.platformOverride || location.platform || 'unknown';
    const strategy = options.bufferStrategy || 'moderate';
    
    const platformSettings = this.PLATFORM_SETTINGS[platform];
    const bufferSettings = this.BUFFER_SETTINGS[strategy];
    
    const baseBuffer = Math.max(bufferSettings.minBuffer, location.accuracy * bufferSettings.multiplier);
    const platformBuffer = baseBuffer * platformSettings.bufferMultiplier;
    const maxBuffer = geofence.radius * bufferSettings.maxRatio;
    const finalBuffer = Math.min(platformBuffer, maxBuffer);
    
    return {
      innerRadius: Math.max(0, geofence.radius - finalBuffer),
      outerRadius: geofence.radius + finalBuffer,
      bufferSize: finalBuffer,
      platformAdjusted: platformBuffer !== baseBuffer
    };
  }

  static determineGeofenceStatus(
    distance: number,
    zones: GeofenceZones,
    previousState?: GeofenceState
  ): 'inside' | 'outside' | 'uncertain' | 'approaching' | 'leaving' {
    if (distance <= zones.innerRadius) {
      return 'inside';
    }
    
    if (distance >= zones.outerRadius) {
      return 'outside';
    }
    
    if (!previousState) {
      return 'uncertain';
    }
    
    const currentStatus = previousState.status;
    const wasInside = currentStatus === 'inside' || currentStatus === 'approaching';
    const wasOutside = currentStatus === 'outside' || currentStatus === 'leaving';
    
    if (wasInside) {
      return distance > zones.innerRadius + (zones.bufferSize * 0.3) ? 'leaving' : 'inside';
    }
    
    if (wasOutside) {
      return distance < zones.outerRadius - (zones.bufferSize * 0.3) ? 'approaching' : 'outside';
    }
    
    return 'uncertain';
  }

  static calculateConfidence(
    distance: number,
    zones: GeofenceZones,
    location: LocationReading,
    options: GeofenceEvaluationOptions
  ): number {
    const platform = options.platformOverride || location.platform || 'unknown';
    const platformSettings = this.PLATFORM_SETTINGS[platform];
    
    let confidence: number;
    
    if (distance <= zones.innerRadius) {
      confidence = 0.9 + (zones.innerRadius - distance) / zones.innerRadius * 0.1;
    } else if (distance >= zones.outerRadius) {
      const excessDistance = distance - zones.outerRadius;
      confidence = Math.max(0.7, 0.9 - (excessDistance / zones.bufferSize) * 0.2);
    } else {
      const uncertaintyPosition = (distance - zones.innerRadius) / (zones.outerRadius - zones.innerRadius);
      confidence = 0.3 + (1 - uncertaintyPosition) * 0.4;
    }
    
    confidence *= platformSettings.confidenceBoost;
    
    if (location.accuracy > 50) confidence *= 0.8;
    if (location.accuracy > 100) confidence *= 0.6;
    
    const age = (Date.now() - location.timestamp) / 1000;
    if (age > 10) confidence *= Math.max(0.7, 1 - age / 60);
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  static determineTriggeredEvent(
    currentStatus: string,
    previousState?: GeofenceState,
    geofence?: Geofence,
    dwellTime?: number
  ): 'entry' | 'exit' | 'none' {
    if (!previousState) {
      return currentStatus === 'inside' ? 'entry' : 'none';
    }
    
    const prevStatus = previousState.status;
    const gracePeriod = geofence?.metadata?.exitGracePeriod || 2;
    const minDwellTime = geofence?.metadata?.minDwellTime || 0;
    
    if ((prevStatus === 'outside' || prevStatus === 'uncertain' || prevStatus === 'approaching') 
        && currentStatus === 'inside') {
      if (minDwellTime === 0 || (dwellTime && dwellTime >= minDwellTime)) {
        return 'entry';
      }
    }
    
    if ((prevStatus === 'inside' || prevStatus === 'leaving') 
        && currentStatus === 'outside' 
        && previousState.consecutiveOutsideCount >= gracePeriod - 1) {
      return 'exit';
    }
    
    return 'none';
  }

  static generateRecommendation(
    status: string,
    confidence: number,
    location: LocationReading,
    zones: GeofenceZones,
    options: GeofenceEvaluationOptions
  ): 'continue' | 'request_high_accuracy' | 'wait' | 'fusion_needed' {
    if (confidence < 0.3) {
      return 'fusion_needed';
    }
    
    if (confidence < 0.5 && status === 'uncertain') {
      if (location.accuracy > 30) {
        return 'request_high_accuracy';
      }
      return 'wait';
    }
    
    if (status === 'approaching' || status === 'leaving') {
      if (location.accuracy > zones.bufferSize * 0.5) {
        return 'request_high_accuracy';
      }
      return 'wait';
    }
    
    if (options.requireHighAccuracy && location.accuracy > 20) {
      return 'request_high_accuracy';
    }
    
    return 'continue';
  }

  static updateGeofenceState(
    geofenceId: string,
    currentStatus: string,
    previousState?: GeofenceState,
    entryTriggered: boolean = false,
    exitTriggered: boolean = false
  ): GeofenceState {
    const now = Date.now();
    
    if (!previousState) {
      return {
        geofenceId,
        status: currentStatus as any,
        consecutiveOutsideCount: currentStatus === 'outside' ? 1 : 0,
        dwellTimeInside: currentStatus === 'inside' ? 0 : 0,
        lastTransitionTime: now,
        entryTime: entryTriggered ? now : undefined,
        exitTime: exitTriggered ? now : undefined
      };
    }
    
    const wasInside = previousState.status === 'inside' || previousState.status === 'approaching';
    const isInside = currentStatus === 'inside' || currentStatus === 'approaching';
    
    let consecutiveOutsideCount = previousState.consecutiveOutsideCount;
    if (currentStatus === 'outside') {
      consecutiveOutsideCount = wasInside ? 1 : consecutiveOutsideCount + 1;
    } else {
      consecutiveOutsideCount = 0;
    }
    
    let dwellTimeInside = previousState.dwellTimeInside;
    if (isInside && wasInside) {
      dwellTimeInside += (now - previousState.lastTransitionTime) / 1000;
    } else if (isInside && !wasInside) {
      dwellTimeInside = 0;
    }
    
    return {
      geofenceId,
      status: currentStatus as any,
      consecutiveOutsideCount,
      dwellTimeInside,
      lastTransitionTime: now,
      entryTime: entryTriggered ? now : previousState.entryTime,
      exitTime: exitTriggered ? now : (exitTriggered ? undefined : previousState.exitTime)
    };
  }

  static validateGeofence(geofence: Geofence): GeofenceValidationResult {
    const errors: string[] = [];
    
    if (!geofence.id || typeof geofence.id !== 'string') {
      errors.push('Geofence ID is required and must be a string');
    }
    
    if (!geofence.center || typeof geofence.center !== 'object') {
      errors.push('Geofence center is required');
    } else {
      if (typeof geofence.center.latitude !== 'number' || 
          geofence.center.latitude < -90 || geofence.center.latitude > 90) {
        errors.push('Invalid latitude');
      }
      
      if (typeof geofence.center.longitude !== 'number' || 
          geofence.center.longitude < -180 || geofence.center.longitude > 180) {
        errors.push('Invalid longitude');
      }
    }
    
    if (typeof geofence.radius !== 'number' || geofence.radius <= 0) {
      errors.push('Radius must be a positive number');
    }
    
    if (geofence.radius > 10000) {
      errors.push('Radius cannot exceed 10km');
    }
    
    if (geofence.radius < 10) {
      errors.push('Radius must be at least 10 meters');
    }
    
    if (geofence.metadata) {
      if (geofence.metadata.minDwellTime && 
          (typeof geofence.metadata.minDwellTime !== 'number' || geofence.metadata.minDwellTime < 0)) {
        errors.push('minDwellTime must be a non-negative number');
      }
      
      if (geofence.metadata.exitGracePeriod && 
          (typeof geofence.metadata.exitGracePeriod !== 'number' || geofence.metadata.exitGracePeriod < 1)) {
        errors.push('exitGracePeriod must be a positive number');
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  static validateEvaluationRequest(data: any): GeofenceValidationResult {
    const errors: string[] = [];
    
    if (!data.currentLocation) {
      errors.push('currentLocation is required');
    }
    
    if (!data.geofences || !Array.isArray(data.geofences)) {
      errors.push('geofences array is required');
    } else {
      if (data.geofences.length === 0) {
        errors.push('At least one geofence is required');
      }
      
      if (data.geofences.length > 20) {
        errors.push('Maximum 20 geofences per request');
      }
      
      data.geofences.forEach((geofence: any, index: number) => {
        const validation = this.validateGeofence(geofence);
        if (!validation.isValid) {
          errors.push(`Geofence ${index}: ${validation.errors.join(', ')}`);
        }
      });
    }
    
    if (data.locationHistory && !Array.isArray(data.locationHistory)) {
      errors.push('locationHistory must be an array');
    }
    
    if (data.previousStates && !Array.isArray(data.previousStates)) {
      errors.push('previousStates must be an array');
    }
    
    if (data.options) {
      const { bufferStrategy, movementContext, platformOverride } = data.options;
      
      if (bufferStrategy && !['conservative', 'moderate', 'aggressive'].includes(bufferStrategy)) {
        errors.push('bufferStrategy must be conservative, moderate, or aggressive');
      }
      
      if (movementContext && !['stationary', 'walking', 'driving'].includes(movementContext)) {
        errors.push('movementContext must be stationary, walking, or driving');
      }
      
      if (platformOverride && !['ios', 'android', 'web', 'unknown'].includes(platformOverride)) {
        errors.push('platformOverride must be ios, android, web, or unknown');
      }
    }
    
    return { isValid: errors.length === 0, errors };
  }

  static getDefaultOptions(): GeofenceEvaluationOptions {
    return {
      enableAutoFusion: true,
      bufferStrategy: 'moderate',
      requireHighAccuracy: false,
      movementContext: 'walking'
    };
  }

  static calculateGlobalRecommendation(evaluations: GeofenceEvaluationResult[]): string {
    const recommendations = evaluations.map(e => e.recommendation);
    
    if (recommendations.includes('fusion_needed')) return 'fusion_needed';
    if (recommendations.includes('request_high_accuracy')) return 'request_high_accuracy';
    if (recommendations.includes('wait')) return 'wait';
    return 'continue';
  }

  static createSummary(evaluations: GeofenceEvaluationResult[], processingTime: number) {
    const activeGeofences = evaluations.filter(e => e.status === 'inside' || e.status === 'approaching').length;
    const triggeredEvents = evaluations.filter(e => e.triggered !== 'none').length;
    const confidences = evaluations.map(e => e.confidence);
    
    return {
      totalGeofences: evaluations.length,
      activeGeofences,
      triggeredEvents,
      highestConfidence: Math.max(...confidences),
      lowestConfidence: Math.min(...confidences),
      processingTime
    };
  }
}