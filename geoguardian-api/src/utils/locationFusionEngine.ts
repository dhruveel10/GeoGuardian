import { LocationReading } from '../types/location';
import { FusionOptions, FusionResult } from '../types/locationFusion';

export class LocationFusionEngine {
  private static readonly PLATFORM_ACCURACY_FACTORS = {
    ios: { multiplier: 0.85, bias: -2 },
    android: { multiplier: 1.1, bias: 1 },
    web: { multiplier: 1.3, bias: 5 },
    unknown: { multiplier: 1.0, bias: 0 }
  };

  private static readonly AGGRESSIVENESS_SETTINGS = {
    conservative: { weightDecay: 0.7, kalmanProcessNoise: 0.1, maxCorrection: 20 },
    moderate: { weightDecay: 0.5, kalmanProcessNoise: 0.5, maxCorrection: 50 },
    aggressive: { weightDecay: 0.3, kalmanProcessNoise: 1.0, maxCorrection: 100 }
  };

  static fuseLocation(
    currentLocation: LocationReading,
    locationHistory: LocationReading[] = [],
    options: FusionOptions
  ): FusionResult {
    const startTime = Date.now();
    const appliedCorrections: string[] = [];
    let fusedLocation = { ...currentLocation };
    let confidenceImprovement = 0;
    const metadata: FusionResult['fusionMetadata'] = {
      algorithmUsed: 'none',
      locationsUsed: 1
    };

    const validHistory = this.filterValidHistory(locationHistory, currentLocation, options.maxHistoryAge || 300000);
    const allLocations = [...validHistory, currentLocation];

    if (options.enableWeightedAveraging && validHistory.length > 0) {
      const weightedResult = this.applyWeightedAveraging(allLocations, options.aggressiveness || 'moderate');
      fusedLocation = weightedResult.location;
      appliedCorrections.push(`Weighted averaging (${validHistory.length + 1} locations)`);
      confidenceImprovement += weightedResult.confidenceGain;
      metadata.algorithmUsed = 'weighted_averaging';
      metadata.locationsUsed = allLocations.length;
      metadata.weightDistribution = weightedResult.weights;
    }

    if (options.enableKalmanFilter && validHistory.length > 0) {
      const kalmanResult = this.applyKalmanFilter(fusedLocation, validHistory, options.aggressiveness || 'moderate');
      fusedLocation = kalmanResult.location;
      appliedCorrections.push(`Kalman filter smoothing`);
      confidenceImprovement += kalmanResult.confidenceGain;
      metadata.algorithmUsed = options.enableWeightedAveraging ? 'weighted_averaging_kalman' : 'kalman_filter';
      metadata.kalmanGain = kalmanResult.gain;
      metadata.estimatedVelocity = kalmanResult.velocity;
    }

    fusedLocation = this.applyPlatformCorrections(fusedLocation, appliedCorrections);

    const processingTime = Date.now() - startTime;
    if (processingTime > 10) {
      metadata.algorithmUsed += '_optimized';
    }

    return {
      originalLocation: currentLocation,
      fusedLocation,
      appliedCorrections,
      confidenceImprovement: Math.round(confidenceImprovement * 100) / 100,
      fusionMetadata: metadata
    };
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

  private static applyWeightedAveraging(
    locations: LocationReading[],
    aggressiveness: FusionOptions['aggressiveness']
  ): { location: LocationReading; weights: number[]; confidenceGain: number } {
    const settings = this.AGGRESSIVENESS_SETTINGS[aggressiveness || 'moderate'];
    const currentLocation = locations[locations.length - 1];
    
    if (locations.length === 1) {
      return {
        location: currentLocation,
        weights: [1.0],
        confidenceGain: 0
      };
    }

    const weights = this.calculateWeights(locations, settings.weightDecay);
    let totalWeight = 0;
    let weightedLat = 0;
    let weightedLon = 0;
    let weightedAccuracy = 0;

    locations.forEach((loc, index) => {
      const weight = weights[index];
      totalWeight += weight;
      weightedLat += loc.latitude * weight;
      weightedLon += loc.longitude * weight;
      weightedAccuracy += loc.accuracy * weight;
    });

    const avgAccuracy = locations.reduce((sum, loc) => sum + loc.accuracy, 0) / locations.length;
    const fusedAccuracy = Math.min(weightedAccuracy / totalWeight, avgAccuracy * 0.8);
    
    const confidenceGain = Math.max(0, (currentLocation.accuracy - fusedAccuracy) / currentLocation.accuracy * 0.3);

    return {
      location: {
        ...currentLocation,
        latitude: weightedLat / totalWeight,
        longitude: weightedLon / totalWeight,
        accuracy: fusedAccuracy
      },
      weights: weights.map(w => Math.round(w / totalWeight * 100) / 100),
      confidenceGain
    };
  }

  private static calculateWeights(locations: LocationReading[], decay: number): number[] {
    const currentTime = locations[locations.length - 1].timestamp;
    
    return locations.map((loc, index) => {
      const age = (currentTime - loc.timestamp) / 1000;
      const ageWeight = Math.exp(-age * decay / 60);
      const accuracyWeight = 1 / (1 + loc.accuracy / 10);
      const platformWeight = this.getPlatformWeight(loc.platform);
      const positionWeight = index === locations.length - 1 ? 1.5 : 1.0;
      
      return ageWeight * accuracyWeight * platformWeight * positionWeight;
    });
  }

  private static getPlatformWeight(platform?: string): number {
    switch (platform) {
      case 'ios': return 1.1;
      case 'android': return 1.0;
      case 'web': return 0.8;
      default: return 0.9;
    }
  }

  private static applyKalmanFilter(
    location: LocationReading,
    history: LocationReading[],
    aggressiveness: FusionOptions['aggressiveness']
  ): { location: LocationReading; gain: number; velocity: { lat: number; lon: number }; confidenceGain: number } {
    const settings = this.AGGRESSIVENESS_SETTINGS[aggressiveness || 'moderate'];
    const processNoise = settings.kalmanProcessNoise;
    
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

    const predictedLat = curr.latitude + velocity.lat * dt;
    const predictedLon = curr.longitude + velocity.lon * dt;
    
    const measurementNoise = location.accuracy / 111000;
    const kalmanGain = processNoise / (processNoise + measurementNoise);
    
    const correctedLat = predictedLat + kalmanGain * (location.latitude - predictedLat);
    const correctedLon = predictedLon + kalmanGain * (location.longitude - predictedLon);
    
    const correction = this.calculateDistance(
      location.latitude, location.longitude,
      correctedLat, correctedLon
    );
    
    const maxCorrection = settings.maxCorrection;
    let finalLat = correctedLat;
    let finalLon = correctedLon;
    
    if (correction > maxCorrection) {
      const ratio = maxCorrection / correction;
      finalLat = location.latitude + (correctedLat - location.latitude) * ratio;
      finalLon = location.longitude + (correctedLon - location.longitude) * ratio;
    }

    const confidenceGain = Math.min(0.2, correction / location.accuracy * 0.1);

    return {
      location: {
        ...location,
        latitude: finalLat,
        longitude: finalLon,
        accuracy: Math.max(location.accuracy * 0.7, location.accuracy - correction)
      },
      gain: Math.round(kalmanGain * 100) / 100,
      velocity,
      confidenceGain
    };
  }

  private static applyPlatformCorrections(
    location: LocationReading,
    appliedCorrections: string[]
  ): LocationReading {
    const platform = location.platform || 'unknown';
    const correction = this.PLATFORM_ACCURACY_FACTORS[platform];
    
    if (correction && (correction.multiplier !== 1.0 || correction.bias !== 0)) {
      appliedCorrections.push(`Platform correction (${platform})`);
      return {
        ...location,
        accuracy: Math.max(1, location.accuracy * correction.multiplier + correction.bias)
      };
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