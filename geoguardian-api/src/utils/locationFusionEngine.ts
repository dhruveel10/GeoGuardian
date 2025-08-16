import { LocationReading } from '../types/location';
import { FusionOptions, FusionResult } from '../types/locationFusion';

export class LocationFusionEngine {
  private static readonly PLATFORM_ACCURACY_FACTORS = {
    ios: { multiplier: 0.85, bias: -2 },
    android: { multiplier: 0.95, bias: 0 },
    web: { multiplier: 0.9, bias: 0 },
    unknown: { multiplier: 1.0, bias: 0 }
  };

  private static readonly PLATFORM_FUSION_SETTINGS = {
    ios: {
      conservative: { 
        weightDecay: 0.8, kalmanProcessNoise: 0.1, maxCorrection: 10, fusionThreshold: 0.95,
        maxDistance: 0.3, correctionFactor: 0.2, maxHistoryPoints: 3, accuracyThreshold: 5
      },
      moderate: { 
        weightDecay: 0.6, kalmanProcessNoise: 0.3, maxCorrection: 20, fusionThreshold: 0.85,
        maxDistance: 0.5, correctionFactor: 0.3, maxHistoryPoints: 4, accuracyThreshold: 15
      },
      aggressive: { 
        weightDecay: 0.4, kalmanProcessNoise: 0.6, maxCorrection: 35, fusionThreshold: 0.75,
        maxDistance: 0.7, correctionFactor: 0.4, maxHistoryPoints: 5, accuracyThreshold: 25
      }
    },
    android: {
      conservative: { 
        weightDecay: 0.7, kalmanProcessNoise: 0.2, maxCorrection: 15, fusionThreshold: 0.9,
        maxDistance: 0.4, correctionFactor: 0.25, maxHistoryPoints: 3, accuracyThreshold: 8
      },
      moderate: { 
        weightDecay: 0.5, kalmanProcessNoise: 0.4, maxCorrection: 25, fusionThreshold: 0.8,
        maxDistance: 0.6, correctionFactor: 0.35, maxHistoryPoints: 4, accuracyThreshold: 20
      },
      aggressive: { 
        weightDecay: 0.3, kalmanProcessNoise: 0.8, maxCorrection: 40, fusionThreshold: 0.7,
        maxDistance: 0.8, correctionFactor: 0.5, maxHistoryPoints: 5, accuracyThreshold: 35
      }
    },
    web: {
      conservative: { 
        weightDecay: 0.4, kalmanProcessNoise: 0.3, maxCorrection: 25, fusionThreshold: 0.75,
        maxDistance: 0.6, correctionFactor: 0.4, maxHistoryPoints: 4, accuracyThreshold: 30
      },
      moderate: { 
        weightDecay: 0.3, kalmanProcessNoise: 0.6, maxCorrection: 40, fusionThreshold: 0.65,
        maxDistance: 0.8, correctionFactor: 0.5, maxHistoryPoints: 5, accuracyThreshold: 50
      },
      aggressive: { 
        weightDecay: 0.2, kalmanProcessNoise: 1.2, maxCorrection: 60, fusionThreshold: 0.55,
        maxDistance: 1.0, correctionFactor: 0.7, maxHistoryPoints: 6, accuracyThreshold: 75
      }
    },
    unknown: {
      conservative: { 
        weightDecay: 0.6, kalmanProcessNoise: 0.2, maxCorrection: 20, fusionThreshold: 0.85,
        maxDistance: 0.5, correctionFactor: 0.3, maxHistoryPoints: 3, accuracyThreshold: 15
      },
      moderate: { 
        weightDecay: 0.4, kalmanProcessNoise: 0.5, maxCorrection: 30, fusionThreshold: 0.75,
        maxDistance: 0.7, correctionFactor: 0.4, maxHistoryPoints: 4, accuracyThreshold: 30
      },
      aggressive: { 
        weightDecay: 0.3, kalmanProcessNoise: 1.0, maxCorrection: 45, fusionThreshold: 0.65,
        maxDistance: 0.9, correctionFactor: 0.6, maxHistoryPoints: 5, accuracyThreshold: 50
      }
    }
  };

  private static readonly ENVIRONMENT_ACCURACY_EXPECTATIONS = {
    indoor: { minRealistic: 15, typical: 40 },
    urban: { minRealistic: 8, typical: 20 },
    outdoor: { minRealistic: 3, typical: 10 },
    unknown: { minRealistic: 10, typical: 25 }
  };

  static fuseLocation(
    currentLocation: LocationReading,
    locationHistory: LocationReading[] = [],
    options: FusionOptions
  ): FusionResult {
    const startTime = Date.now();
    const appliedCorrections: string[] = [];
    const metadata: FusionResult['fusionMetadata'] = {
      algorithmUsed: 'smart_conditional',
      locationsUsed: 1
    };

    const platform = currentLocation.platform || 'unknown';
    const aggressiveness = options.aggressiveness || 'moderate';
    const settings = this.PLATFORM_FUSION_SETTINGS[platform][aggressiveness];
    
    const validHistory = this.filterValidHistory(locationHistory, currentLocation, options.maxHistoryAge || 300000, settings.maxHistoryPoints);
    
    const shouldAttemptFusion = this.shouldAttemptFusion(currentLocation, validHistory, settings, platform);
    if (!shouldAttemptFusion.should) {
      appliedCorrections.push(shouldAttemptFusion.reason);
      return {
        originalLocation: currentLocation,
        fusedLocation: currentLocation,
        appliedCorrections,
        confidenceImprovement: 0,
        fusionMetadata: { ...metadata, algorithmUsed: 'smart_bailout' }
      };
    }

    let bestLocation = { ...currentLocation };
    let bestConfidence = this.calculateLocationConfidence(currentLocation);
    let confidenceImprovement = 0;

    if (options.enableWeightedAveraging && validHistory.length > 0) {
      const weightedResult = this.applyPlatformSpecificWeightedAveraging(
        [...validHistory, currentLocation], 
        platform,
        aggressiveness
      );
      
      const fusedConfidence = this.calculateLocationConfidence(weightedResult.location);
      if (fusedConfidence > bestConfidence * settings.fusionThreshold) {
        bestLocation = weightedResult.location;
        bestConfidence = fusedConfidence;
        appliedCorrections.push(`Platform-optimized weighted averaging (${validHistory.length + 1} locations)`);
        confidenceImprovement += weightedResult.confidenceGain;
        metadata.algorithmUsed = 'platform_weighted_averaging';
        metadata.locationsUsed = validHistory.length + 1;
        metadata.weightDistribution = weightedResult.weights;
      } else {
        appliedCorrections.push(`Weighted averaging rejected (confidence: ${fusedConfidence.toFixed(3)} < threshold: ${(bestConfidence * settings.fusionThreshold).toFixed(3)})`);
      }
    }

    if (options.enableKalmanFilter && validHistory.length > 1) {
      const kalmanResult = this.applyPlatformSpecificKalmanFilter(
        bestLocation, 
        validHistory, 
        platform,
        aggressiveness
      );
      
      const kalmanConfidence = this.calculateLocationConfidence(kalmanResult.location);
      if (kalmanConfidence > bestConfidence * settings.fusionThreshold) {
        bestLocation = kalmanResult.location;
        bestConfidence = kalmanConfidence;
        appliedCorrections.push(`Platform-optimized Kalman filter`);
        confidenceImprovement += kalmanResult.confidenceGain;
        metadata.algorithmUsed = metadata.algorithmUsed.includes('weighted') ? 
          'platform_weighted_adaptive_kalman' : 'platform_adaptive_kalman';
        metadata.kalmanGain = kalmanResult.gain;
        metadata.estimatedVelocity = kalmanResult.velocity;
      } else {
        appliedCorrections.push(`Kalman filter rejected (confidence: ${kalmanConfidence.toFixed(3)} < threshold: ${(bestConfidence * settings.fusionThreshold).toFixed(3)})`);
      }
    }

    const originalConfidence = this.calculateLocationConfidence(currentLocation);
    const finalConfidence = this.calculateLocationConfidence(bestLocation);
    
    if (finalConfidence < originalConfidence * 0.9) {
      appliedCorrections.length = 0;
      appliedCorrections.push('All fusion rejected - would decrease confidence significantly');
      bestLocation = currentLocation;
      metadata.algorithmUsed = 'confidence_fallback';
    }

    const processingTime = Date.now() - startTime;
    
    return {
      originalLocation: currentLocation,
      fusedLocation: bestLocation,
      appliedCorrections,
      confidenceImprovement: Math.round(confidenceImprovement * 100) / 100,
      fusionMetadata: metadata
    };
  }

  private static shouldAttemptFusion(
    current: LocationReading, 
    history: LocationReading[], 
    settings: any,
    platform: string
  ): { should: boolean; reason: string } {
    
    if (history.length === 0) {
      return { should: false, reason: 'No location history available' };
    }

    if (current.accuracy <= settings.accuracyThreshold / 2) {
      return { should: false, reason: `Current accuracy excellent (≤${settings.accuracyThreshold / 2}m) - fusion unnecessary` };
    }

    if (history.length > 0) {
      const lastLocation = history[history.length - 1];
      const timeDiff = (current.timestamp - lastLocation.timestamp) / 1000;
      const distance = this.calculateDistance(
        current.latitude, current.longitude,
        lastLocation.latitude, lastLocation.longitude
      );
      const speed = timeDiff > 0 ? (distance / timeDiff) * 3.6 : 0;
      
      const speedThreshold = platform === 'web' ? 30 : platform === 'android' ? 40 : 50;
      if (speed > speedThreshold) {
        return { should: false, reason: `High speed detected (${speed.toFixed(1)} km/h) - fusion too risky for ${platform}` };
      }
    }

    const accuracyThreshold = current.accuracy * (platform === 'web' ? 2.0 : platform === 'android' ? 1.5 : 1.2);
    const goodHistoryCount = history.filter(loc => loc.accuracy <= accuracyThreshold).length;
    const minGoodHistory = platform === 'web' ? 1 : 1;
    
    if (goodHistoryCount < minGoodHistory) {
      return { should: false, reason: `Insufficient quality history for reliable fusion (${goodHistoryCount}/${minGoodHistory} good readings)` };
    }

    return { should: true, reason: `Fusion conditions favorable for ${platform}` };
  }

  private static calculateLocationConfidence(location: LocationReading): number {
    const platform = location.platform || 'unknown';
    const accuracy = location.accuracy;
    
    let confidence = 1 / (1 + accuracy / 10);
    
    const platformMultipliers = {
      ios: 1.15,
      android: 1.0,
      web: 0.7,
      unknown: 0.85
    };
    
    confidence *= platformMultipliers[platform] || 0.85;
    
    if (platform === 'web') {
      confidence = Math.max(0.2, confidence);
      if (accuracy > 100) confidence *= 0.8;
    }
    
    if (platform === 'android' && accuracy < 5) {
      confidence *= 0.9;
    }
    
    if (platform === 'ios' && accuracy < 3) {
      confidence *= 0.95;
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private static filterValidHistory(
    history: LocationReading[],
    currentLocation: LocationReading,
    maxAge: number,
    maxPoints: number
  ): LocationReading[] {
    const currentTime = currentLocation.timestamp;
    const platform = currentLocation.platform || 'unknown';
    const accuracyFilter = platform === 'web' ? 500 : platform === 'android' ? 200 : 100;
    
    return history
      .filter(loc => {
        const age = currentTime - loc.timestamp;
        return age > 0 && age <= maxAge && loc.accuracy < accuracyFilter;
      })
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-maxPoints);
  }

  private static applyPlatformSpecificWeightedAveraging(
    locations: LocationReading[],
    platform: string,
    aggressiveness: FusionOptions['aggressiveness']
  ): { location: LocationReading; weights: number[]; confidenceGain: number } {
    const currentLocation = locations[locations.length - 1];
    
    if (locations.length === 1) {
      return {
        location: currentLocation,
        weights: [1.0],
        confidenceGain: 0
      };
    }

    const settings = this.PLATFORM_FUSION_SETTINGS[platform][aggressiveness || 'moderate'];
    const realisticLocations = locations.map(loc => this.adjustOptimisticAccuracy(loc));
    
    const maxDistance = Math.min(currentLocation.accuracy * settings.maxDistance, settings.maxCorrection);
    const validForAveraging = realisticLocations.filter((loc, index) => {
      if (index === realisticLocations.length - 1) return true;
      const distance = this.calculateDistance(
        currentLocation.latitude, currentLocation.longitude,
        loc.latitude, loc.longitude
      );
      return distance <= maxDistance;
    });

    if (validForAveraging.length < 2) {
      return {
        location: currentLocation,
        weights: [1.0],
        confidenceGain: 0
      };
    }

    if (validForAveraging.length > 2 && platform !== 'web') {
      const movements = [];
      for (let i = 1; i < validForAveraging.length; i++) {
        const prev = validForAveraging[i-1];
        const curr = validForAveraging[i];
        const dist = this.calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
        movements.push(dist);
      }
      const maxMovement = Math.max(...movements);
      const avgMovement = movements.reduce((sum, m) => sum + m, 0) / movements.length;
      
      const movementThreshold = platform === 'ios' ? 3 : 4;
      if (maxMovement > avgMovement * movementThreshold) {
        return {
          location: currentLocation,
          weights: [1.0],
          confidenceGain: 0
        };
      }
    }

    const weights = this.calculatePlatformSpecificWeights(validForAveraging, platform, aggressiveness);
    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLon = 0;

    validForAveraging.forEach((loc, index) => {
      const weight = weights[index];
      totalWeight += weight;
      weightedLat += loc.latitude * weight;
      weightedLon += loc.longitude * weight;
    });

    const avgLat = weightedLat / totalWeight;
    const avgLon = weightedLon / totalWeight;
    
    const correctionFactor = settings.correctionFactor;
    const correctedLat = currentLocation.latitude + (avgLat - currentLocation.latitude) * correctionFactor;
    const correctedLon = currentLocation.longitude + (avgLon - currentLocation.longitude) * correctionFactor;
    
    const accuracyImprovementPercent = platform === 'web' ? 0.2 : platform === 'android' ? 0.15 : 0.1;
    const maxImprovement = platform === 'web' ? 15 : platform === 'android' ? 8 : 5;
    const accuracyImprovement = Math.min(currentLocation.accuracy * accuracyImprovementPercent, maxImprovement);
    const conservativeAccuracy = Math.max(3, currentLocation.accuracy - accuracyImprovement);
    
    const fusedLocation = {
      ...currentLocation,
      latitude: correctedLat,
      longitude: correctedLon,
      accuracy: conservativeAccuracy
    };

    const correctionDistance = this.calculateDistance(
      currentLocation.latitude, currentLocation.longitude,
      correctedLat, correctedLon
    );
    
    const maxCorrectionDistance = platform === 'web' ? currentLocation.accuracy * 0.4 : 
                                 platform === 'android' ? currentLocation.accuracy * 0.3 : 
                                 currentLocation.accuracy * 0.2;
    
    if (correctionDistance > maxCorrectionDistance) {
      return {
        location: currentLocation,
        weights: [1.0],
        confidenceGain: 0
      };
    }

    return {
      location: fusedLocation,
      weights: weights.map(w => Math.round(w / totalWeight * 100) / 100),
      confidenceGain: accuracyImprovement / currentLocation.accuracy * (platform === 'web' ? 0.3 : 0.2)
    };
  }

  private static calculatePlatformSpecificWeights(
    locations: LocationReading[], 
    platform: string, 
    aggressiveness: FusionOptions['aggressiveness']
  ): number[] {
    const currentIndex = locations.length - 1;
    const settings = this.PLATFORM_FUSION_SETTINGS[platform][aggressiveness || 'moderate'];
    
    const currentBias = platform === 'web' ? 3.0 : platform === 'android' ? 4.0 : 5.0;
    
    return locations.map((loc, index) => {
      if (index === currentIndex) {
        return currentBias;
      }
      
      const age = (locations[currentIndex].timestamp - loc.timestamp) / 1000;
      const confidence = this.calculateLocationConfidence(loc);
      
      const ageWeight = Math.exp(-age * settings.weightDecay / 60);
      const baseWeight = confidence * ageWeight;
      
      const platformMultiplier = platform === 'web' ? 0.8 : platform === 'android' ? 0.6 : 0.4;
      
      return baseWeight * platformMultiplier;
    });
  }

  private static adjustOptimisticAccuracy(location: LocationReading): LocationReading {
    const platform = location.platform || 'unknown';
    let adjustedAccuracy = location.accuracy;
    
    if (platform === 'web') {
      adjustedAccuracy = Math.max(adjustedAccuracy, 20);
    } else if (platform === 'android') {
      adjustedAccuracy = Math.max(adjustedAccuracy, 5);
    } else if (platform === 'ios') {
      adjustedAccuracy = Math.max(adjustedAccuracy, 3);
    }
    
    const age = (Date.now() - location.timestamp) / 1000;
    if (age > 30) {
      const ageMultiplier = platform === 'web' ? 1.5 : platform === 'android' ? 1.3 : 1.2;
      adjustedAccuracy *= (1 + age / 60 * ageMultiplier);
    }
    
    return { ...location, accuracy: adjustedAccuracy };
  }

  private static applyPlatformSpecificKalmanFilter(
    location: LocationReading,
    history: LocationReading[],
    platform: string,
    aggressiveness: FusionOptions['aggressiveness']
  ): { location: LocationReading; gain: number; velocity: { lat: number; lon: number }; confidenceGain: number } {
    
    if (history.length < 2) {
      return {
        location,
        gain: 0,
        velocity: { lat: 0, lon: 0 },
        confidenceGain: 0
      };
    }

    const settings = this.PLATFORM_FUSION_SETTINGS[platform][aggressiveness || 'moderate'];
    const historyPoints = Math.min(history.length, platform === 'web' ? 3 : 2);
    const relevantHistory = history.slice(-historyPoints);
    
    const prev = relevantHistory[0];
    const curr = relevantHistory[relevantHistory.length - 1];
    
    const dt = Math.max(1, (location.timestamp - curr.timestamp) / 1000);
    const velocity = {
      lat: (curr.latitude - prev.latitude) / ((curr.timestamp - prev.timestamp) / 1000),
      lon: (curr.longitude - prev.longitude) / ((curr.timestamp - prev.timestamp) / 1000)
    };

    const currentConfidence = this.calculateLocationConfidence(location);
    const historyConfidence = this.calculateLocationConfidence(curr);
    
    const speedLat = velocity.lat * 111000;
    const speedLon = velocity.lon * 111000;
    const avgSpeed = Math.sqrt(speedLat * speedLat + speedLon * speedLon);
    
    let adaptiveGain = currentConfidence / (currentConfidence + historyConfidence);
    
    if (platform === 'web') {
      adaptiveGain = Math.min(0.8, adaptiveGain * 1.4);
      if (avgSpeed > 2) adaptiveGain = Math.min(0.9, adaptiveGain * 1.3);
    } else if (platform === 'android') {
      adaptiveGain = Math.min(0.7, adaptiveGain * 1.2);
      if (avgSpeed > 3) adaptiveGain = Math.min(0.8, adaptiveGain * 1.2);
    } else {
      if (avgSpeed > 5) adaptiveGain = Math.min(0.6, adaptiveGain * 1.1);
    }
    
    const processNoise = settings.kalmanProcessNoise;
    const noiseAdjustment = platform === 'web' ? 1.5 : platform === 'android' ? 1.2 : 1.0;
    const adjustedGain = adaptiveGain * (1 + processNoise * noiseAdjustment);
    
    const predictedLat = curr.latitude + velocity.lat * dt;
    const predictedLon = curr.longitude + velocity.lon * dt;
    
    const correctedLat = predictedLat + adjustedGain * (location.latitude - predictedLat);
    const correctedLon = predictedLon + adjustedGain * (location.longitude - predictedLon);
    
    const improvementFactor = platform === 'web' ? 0.25 : platform === 'android' ? 0.2 : 0.15;
    const maxImprovement = platform === 'web' ? 0.3 : platform === 'android' ? 0.25 : 0.2;
    const accuracyImprovement = Math.min(improvementFactor, maxImprovement);
    const improvedAccuracy = location.accuracy * (1 - accuracyImprovement);
    
    const originalConfidence = this.calculateLocationConfidence(location);
    const fusedLocation = {
      ...location,
      latitude: correctedLat,
      longitude: correctedLon,
      accuracy: improvedAccuracy
    };
    const fusedConfidence = this.calculateLocationConfidence(fusedLocation);
    
    return {
      location: fusedLocation,
      gain: Math.round(adjustedGain * 100) / 100,
      velocity,
      confidenceGain: Math.max(0, fusedConfidence - originalConfidence)
    };
  }

  private static applyPlatformCorrections(
    location: LocationReading,
    appliedCorrections: string[]
  ): LocationReading {
    const platform = location.platform || 'unknown';
    const correction = this.PLATFORM_ACCURACY_FACTORS[platform];
    
    if (correction && correction.multiplier !== 1.0 && location.accuracy > 10) {
      const correctedAccuracy = Math.max(3, location.accuracy * correction.multiplier + correction.bias);
      
      if (correctedAccuracy < location.accuracy) {
        return {
          ...location,
          accuracy: correctedAccuracy
        };
      }
    }
    
    return location;
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

  static getDefaultOptions(): FusionOptions {
    return {
      enableWeightedAveraging: true,
      enableKalmanFilter: false,
      aggressiveness: 'moderate',
      maxHistoryAge: 300000
    };
  }

  static validateFusionRequest(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!data.currentLocation) {
      errors.push('currentLocation is required');
    }

    if (data.locationHistory && !Array.isArray(data.locationHistory)) {
      errors.push('locationHistory must be an array');
    }

    if (data.locationHistory && data.locationHistory.length > 10) {
      errors.push('locationHistory cannot exceed 10 entries');
    }

    if (data.fusionOptions) {
      const { enableWeightedAveraging, enableKalmanFilter, aggressiveness } = data.fusionOptions;
      
      if (enableWeightedAveraging !== undefined && typeof enableWeightedAveraging !== 'boolean') {
        errors.push('fusionOptions.enableWeightedAveraging must be boolean');
      }
      
      if (enableKalmanFilter !== undefined && typeof enableKalmanFilter !== 'boolean') {
        errors.push('fusionOptions.enableKalmanFilter must be boolean');
      }
      
      if (aggressiveness && !['conservative', 'moderate', 'aggressive'].includes(aggressiveness)) {
        errors.push('fusionOptions.aggressiveness must be conservative, moderate, or aggressive');
      }
    }

    return { isValid: errors.length === 0, errors };
  }
}