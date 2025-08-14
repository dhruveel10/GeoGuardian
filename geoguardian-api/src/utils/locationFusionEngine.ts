import { LocationReading } from '../types/location';
import { FusionOptions, FusionResult } from '../types/locationFusion';

export class LocationFusionEngine {
  private static readonly PLATFORM_ACCURACY_FACTORS = {
    ios: { multiplier: 0.85, bias: -2 },
    android: { multiplier: 0.95, bias: 0 },
    web: { multiplier: 0.9, bias: 0 },
    unknown: { multiplier: 1.0, bias: 0 }
  };

  private static readonly AGGRESSIVENESS_SETTINGS = {
    conservative: { weightDecay: 0.7, kalmanProcessNoise: 0.1, maxCorrection: 15, fusionThreshold: 0.9 },
    moderate: { weightDecay: 0.5, kalmanProcessNoise: 0.5, maxCorrection: 30, fusionThreshold: 0.8 },
    aggressive: { weightDecay: 0.3, kalmanProcessNoise: 1.0, maxCorrection: 50, fusionThreshold: 0.7 }
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

    const settings = this.AGGRESSIVENESS_SETTINGS[options.aggressiveness || 'moderate'];
    const validHistory = this.filterValidHistory(locationHistory, currentLocation, options.maxHistoryAge || 300000);
    
    const shouldAttemptFusion = this.shouldAttemptFusion(currentLocation, validHistory, settings);
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
      const weightedResult = this.applySmartWeightedAveraging(
        [...validHistory, currentLocation], 
        options.aggressiveness || 'moderate'
      );
      
      const fusedConfidence = this.calculateLocationConfidence(weightedResult.location);
      if (fusedConfidence > bestConfidence * settings.fusionThreshold) {
        bestLocation = weightedResult.location;
        bestConfidence = fusedConfidence;
        appliedCorrections.push(`Smart weighted averaging (${validHistory.length + 1} locations)`);
        confidenceImprovement += weightedResult.confidenceGain;
        metadata.algorithmUsed = 'smart_weighted_averaging';
        metadata.locationsUsed = validHistory.length + 1;
        metadata.weightDistribution = weightedResult.weights;
      } else {
        appliedCorrections.push(`Weighted averaging rejected (confidence too low)`);
      }
    }

    if (options.enableKalmanFilter && validHistory.length > 1) {
      const kalmanResult = this.applyAdaptiveKalmanFilter(
        bestLocation, 
        validHistory, 
        options.aggressiveness || 'moderate'
      );
      
      const kalmanConfidence = this.calculateLocationConfidence(kalmanResult.location);
      if (kalmanConfidence > bestConfidence * settings.fusionThreshold) {
        bestLocation = kalmanResult.location;
        bestConfidence = kalmanConfidence;
        appliedCorrections.push(`Adaptive Kalman filter`);
        confidenceImprovement += kalmanResult.confidenceGain;
        metadata.algorithmUsed = metadata.algorithmUsed.includes('weighted') ? 
          'smart_weighted_adaptive_kalman' : 'adaptive_kalman';
        metadata.kalmanGain = kalmanResult.gain;
        metadata.estimatedVelocity = kalmanResult.velocity;
      } else {
        appliedCorrections.push(`Kalman filter rejected (confidence too low)`);
      }
    }

    const originalConfidence = this.calculateLocationConfidence(currentLocation);
    const finalConfidence = this.calculateLocationConfidence(bestLocation);
    
    if (finalConfidence < originalConfidence * 0.95) {
      appliedCorrections.length = 0;
      appliedCorrections.push('All fusion rejected - would decrease confidence');
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
    settings: any
  ): { should: boolean; reason: string } {
    
    if (history.length === 0) {
      return { should: false, reason: 'No location history available' };
    }

    if (current.accuracy <= 8) {
      return { should: false, reason: 'Current accuracy excellent (≤8m) - fusion unnecessary' };
    }

    if (history.length > 0) {
      const lastLocation = history[history.length - 1];
      const timeDiff = (current.timestamp - lastLocation.timestamp) / 1000;
      const distance = this.calculateDistance(
        current.latitude, current.longitude,
        lastLocation.latitude, lastLocation.longitude
      );
      const speed = timeDiff > 0 ? (distance / timeDiff) * 3.6 : 0;
      
      if (speed > 50) {
        return { should: false, reason: `High speed detected (${speed.toFixed(1)} km/h) - fusion too risky` };
      }
    }

    const goodHistoryCount = history.filter(loc => loc.accuracy <= current.accuracy * 1.2).length;
    if (goodHistoryCount < 1) {
      return { should: false, reason: 'Insufficient quality history for reliable fusion' };
    }

    return { should: true, reason: 'Fusion conditions favorable' };
  }

  private static calculateLocationConfidence(location: LocationReading): number {
    const platform = location.platform || 'unknown';
    const accuracy = location.accuracy;
    
    let confidence = 1 / (1 + accuracy / 10);
    
    const platformMultipliers = {
      ios: 1.1,
      android: 1.0,
      web: 0.8,
      unknown: 0.9
    };
    
    confidence *= platformMultipliers[platform] || 0.9;
    
    if (platform === 'web' && accuracy < 15) {
      confidence *= 0.7;
    }
    
    if (platform === 'android' && accuracy < 5) {
      confidence *= 0.8;
    }
    
    return Math.max(0.1, Math.min(1.0, confidence));
  }

  private static filterValidHistory(
    history: LocationReading[],
    currentLocation: LocationReading,
    maxAge: number
  ): LocationReading[] {
    const currentTime = currentLocation.timestamp;
    return history
      .filter(loc => {
        const age = currentTime - loc.timestamp;
        return age > 0 && age <= maxAge && loc.accuracy < 1000;
      })
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-4);
  }

  private static applySmartWeightedAveraging(
    locations: LocationReading[],
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

    const realisticLocations = locations.map(loc => this.adjustOptimisticAccuracy(loc));
    const weights = this.calculateSmartWeights(realisticLocations, aggressiveness);
    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLon = 0;
    let weightedPrecision = 0;

    realisticLocations.forEach((loc, index) => {
      const weight = weights[index];
      const precision = 1 / (loc.accuracy * loc.accuracy);
      
      totalWeight += weight;
      weightedLat += loc.latitude * weight;
      weightedLon += loc.longitude * weight;
      weightedPrecision += precision * weight;
    });

    const fusedAccuracy = Math.sqrt(totalWeight / weightedPrecision);
    const bestIndividualAccuracy = Math.min(...realisticLocations.map(l => l.accuracy));
    const conservativeAccuracy = Math.max(fusedAccuracy, bestIndividualAccuracy * 0.8);
    
    const originalConfidence = this.calculateLocationConfidence(currentLocation);
    const fusedLocationTemp = {
      ...currentLocation,
      latitude: weightedLat / totalWeight,
      longitude: weightedLon / totalWeight,
      accuracy: conservativeAccuracy
    };
    const fusedConfidence = this.calculateLocationConfidence(fusedLocationTemp);
    
    const confidenceGain = Math.max(0, fusedConfidence - originalConfidence);

    return {
      location: fusedLocationTemp,
      weights: weights.map(w => Math.round(w / totalWeight * 100) / 100),
      confidenceGain
    };
  }

  private static adjustOptimisticAccuracy(location: LocationReading): LocationReading {
    const platform = location.platform || 'unknown';
    let adjustedAccuracy = location.accuracy;
    
    if (platform === 'web') {
      adjustedAccuracy = Math.max(adjustedAccuracy, 15);
    }
    
    if (platform === 'android' && adjustedAccuracy < 8) {
      adjustedAccuracy = Math.max(adjustedAccuracy, 8);
    }
    
    const age = (Date.now() - location.timestamp) / 1000;
    if (age > 30) {
      adjustedAccuracy *= (1 + age / 60);
    }
    
    return { ...location, accuracy: adjustedAccuracy };
  }

  private static calculateSmartWeights(locations: LocationReading[], aggressiveness: FusionOptions['aggressiveness']): number[] {
    const settings = this.AGGRESSIVENESS_SETTINGS[aggressiveness || 'moderate'];
    const currentTime = locations[locations.length - 1].timestamp;
    
    return locations.map((loc, index) => {
      const age = (currentTime - loc.timestamp) / 1000;
      const confidence = this.calculateLocationConfidence(loc);
      
      const ageWeight = Math.exp(-age * settings.weightDecay / 60);
      const recencyBonus = index === locations.length - 1 ? 2.0 : 1.0;
      const confidenceWeight = Math.pow(confidence, 2);
      
      return ageWeight * confidenceWeight * recencyBonus;
    });
  }

  private static applyAdaptiveKalmanFilter(
    location: LocationReading,
    history: LocationReading[],
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

    const lastTwo = history.slice(-2);
    const prev = lastTwo[0];
    const curr = lastTwo[1];
    
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
    if (avgSpeed > 5) {
      adaptiveGain = Math.min(0.8, adaptiveGain * 1.5);
    }
    
    const predictedLat = curr.latitude + velocity.lat * dt;
    const predictedLon = curr.longitude + velocity.lon * dt;
    
    const correctedLat = predictedLat + adaptiveGain * (location.latitude - predictedLat);
    const correctedLon = predictedLon + adaptiveGain * (location.longitude - predictedLon);
    
    const improvementFactor = Math.min(0.9, currentConfidence);
    const improvedAccuracy = location.accuracy * (1 - improvementFactor * 0.2);
    
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
      gain: Math.round(adaptiveGain * 100) / 100,
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