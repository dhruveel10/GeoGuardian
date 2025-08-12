import { LocationReading } from '../types/location';
import { MovementAnalysisRequest, MovementAnalysisResult } from '../types/movementAnalysis';

export class MovementAnomalyAnalyzer {
  private static readonly DEFAULT_MAX_SPEEDS = {
    walking: 15,    // km/h
    cycling: 40,    // km/h
    driving: 200,   // km/h
    flying: 1000,   // km/h
    unknown: 150    // km/h - reasonable default
  };

  private static readonly EARTH_RADIUS = 6371;

  static analyzeMovement(request: MovementAnalysisRequest): MovementAnalysisResult {
    const { previousLocation, currentLocation, contextHints } = request;
    
    const distance = this.calculateDistance(previousLocation, currentLocation);
    const timeElapsed = (currentLocation.timestamp - previousLocation.timestamp) / 1000;
    const impliedSpeedMs = distance / timeElapsed;
    const impliedSpeedKmh = impliedSpeedMs * 3.6;

    const maxSpeed = request.maxReasonableSpeed || 
      this.DEFAULT_MAX_SPEEDS[contextHints?.transportMode || 'unknown'];

    let accepted = true;
    let anomalyType: MovementAnalysisResult['anomalyType'] | undefined;
    let confidence = 1.0;
    let reason = 'Movement appears normal';
    let recommendation = 'Location reading accepted';

    if (timeElapsed <= 0) {
      accepted = false;
      anomalyType = 'time_inconsistency';
      confidence = 0;
      reason = 'Current timestamp is not after previous timestamp';
      recommendation = 'Check system clock synchronization';
    } else if (timeElapsed < 1) {
      accepted = false;
      anomalyType = 'time_inconsistency';
      confidence = 0;
      reason = `Time elapsed too short: ${timeElapsed.toFixed(2)} seconds`;
      recommendation = 'Location updates too frequent - implement minimum interval';
    } else if (distance > 20000) {
      accepted = false;
      anomalyType = 'teleportation';
      confidence = 0;
      reason = `Impossible distance: ${(distance/1000).toFixed(1)}km in ${timeElapsed.toFixed(0)} seconds`;
      recommendation = 'GPS jumped between continents - clear GPS cache';
    } else if (impliedSpeedKmh > maxSpeed) {
      const speedRatio = impliedSpeedKmh / maxSpeed;
      accepted = false;
      anomalyType = speedRatio > 3 ? 'teleportation' : 'impossible_speed';
      confidence = 0;
      reason = `Impossible speed: ${impliedSpeedKmh.toFixed(1)} km/h (max expected: ${maxSpeed} km/h)`;
      
      if (speedRatio > 10) {
        recommendation = 'GPS error detected - request fresh location reading';
      } else if (speedRatio > 3) {
        recommendation = 'Possible GPS jump - verify with additional reading';
      } else {
        recommendation = 'Speed exceeds transport mode limits - verify movement context';
      }
    } else if (impliedSpeedKmh > maxSpeed * 0.8) {
      confidence = 0.7;
      reason = `High speed detected: ${impliedSpeedKmh.toFixed(1)} km/h (approaching limit)`;
      recommendation = 'Movement near speed limits - monitor next reading';
    } else if (distance < 3 && timeElapsed > 30) {
      confidence = 0.9;
      reason = `Stationary or slow movement: ${distance.toFixed(1)}m in ${timeElapsed.toFixed(0)}s`;
      recommendation = 'Low movement detected - normal for stationary use';
    }

    if (previousLocation.accuracy > 100 || currentLocation.accuracy > 100) {
      confidence *= 0.5;
      reason += ' (reduced confidence due to poor GPS accuracy)';
      recommendation += ' Consider waiting for better GPS signal quality';
    }

    return {
      accepted,
      distance: Math.round(distance * 100) / 100,
      timeElapsed: Math.round(timeElapsed * 100) / 100,
      impliedSpeed: Math.round(impliedSpeedKmh * 100) / 100,
      speedUnit: 'km/h',
      anomalyType,
      confidence: Math.round(confidence * 100) / 100,
      reason,
      recommendation,
      metadata: {
        processingTime: 0,
        maxAllowedSpeed: maxSpeed,
        actualSpeedRatio: Math.round((impliedSpeedKmh / maxSpeed) * 100) / 100
      }
    };
  }

  private static calculateDistance(loc1: LocationReading, loc2: LocationReading): number {
    const lat1Rad = (loc1.latitude * Math.PI) / 180;
    const lat2Rad = (loc2.latitude * Math.PI) / 180;
    const deltaLatRad = ((loc2.latitude - loc1.latitude) * Math.PI) / 180;
    const deltaLonRad = ((loc2.longitude - loc1.longitude) * Math.PI) / 180;

    const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) *
      Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = this.EARTH_RADIUS * c * 1000;

    return distance;
  }

  static getSpeedLimitsForContext(contextHints?: MovementAnalysisRequest['contextHints']) {
    const transportMode = contextHints?.transportMode || 'unknown';
    const environment = contextHints?.environment || 'unknown';

    let baseSpeed = this.DEFAULT_MAX_SPEEDS[transportMode];

    if (environment === 'urban' && transportMode === 'driving') {
      baseSpeed = Math.min(baseSpeed, 80);
    } else if (environment === 'highway' && transportMode === 'driving') {
      baseSpeed = Math.min(baseSpeed, 160);
    } else if (environment === 'indoor') {
      baseSpeed = Math.min(baseSpeed, 10);
    }

    return {
      recommended: baseSpeed,
      absolute: baseSpeed * 1.5,
      conservative: baseSpeed * 0.7
    };
  }
}