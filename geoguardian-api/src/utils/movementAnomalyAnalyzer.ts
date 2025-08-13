import { LocationReading } from '../types/location';
import { MovementAnalysisRequest, MovementAnalysisResult } from '../types/movementAnalysis';

export class MovementAnomalyAnalyzer {
  private static readonly DEFAULT_MAX_SPEEDS: Record<string, number> = {
    walking: 15,
    cycling: 40,
    driving: 200,
    flying: 1000,
    stationary: 0.5,
    unknown: 150
  };

  private static readonly GPS_DRIFT_LIMITS: Record<string, {normal: number, warning: number, anomaly: number}> = {
    indoor: { normal: 5, warning: 10, anomaly: 20 },
    urban: { normal: 8, warning: 15, anomaly: 30 },
    rural: { normal: 3, warning: 8, anomaly: 15 },
    outdoor: { normal: 5, warning: 12, anomaly: 25 },
    highway: { normal: 10, warning: 20, anomaly: 40 },
    unknown: { normal: 8, warning: 15, anomaly: 30 }
  };

  private static readonly EARTH_RADIUS = 6371;

  static analyzeMovement(request: MovementAnalysisRequest): MovementAnalysisResult {
    const { previousLocation, currentLocation, contextHints, deviceInfo } = request;
    
    const distance = this.calculateDistance(previousLocation, currentLocation);
    const timeElapsed = (currentLocation.timestamp - previousLocation.timestamp) / 1000;
    const impliedSpeedMs = distance / timeElapsed;
    const impliedSpeedKmh = impliedSpeedMs * 3.6;

    const transportMode: string = contextHints?.transportMode || 'unknown';
    const environment: string = contextHints?.environment || 'unknown';
    
    const maxSpeed = request.maxReasonableSpeed || this.getContextualMaxSpeed(transportMode, environment);
    const driftLimits = this.GPS_DRIFT_LIMITS[environment];

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
    } else if (transportMode === 'stationary') {
      if (distance > driftLimits.anomaly) {
        accepted = false;
        anomalyType = 'gps_drift';
        confidence = 0;
        reason = `Excessive GPS drift for stationary mode: ${distance.toFixed(1)}m (limit: ${driftLimits.anomaly}m)`;
        recommendation = 'GPS signal unstable - wait for better signal or change location';
      } else if (distance > driftLimits.warning) {
        accepted = false;
        anomalyType = 'gps_drift';
        confidence = 0.3;
        reason = `High GPS drift detected: ${distance.toFixed(1)}m in stationary mode (warning limit: ${driftLimits.warning}m)`;
        recommendation = 'GPS drift above normal - monitor signal quality';
      } else if (distance > driftLimits.normal) {
        accepted = true;
        confidence = 0.7;
        reason = `Moderate GPS drift: ${distance.toFixed(1)}m for stationary device (normal limit: ${driftLimits.normal}m)`;
        recommendation = 'Acceptable GPS drift but monitor for patterns';
      } else {
        accepted = true;
        confidence = 0.95;
        reason = `Normal GPS drift: ${distance.toFixed(1)}m for stationary device`;
        recommendation = 'Acceptable GPS drift for stationary mode';
      }
      
      if (previousLocation.accuracy > 100 || currentLocation.accuracy > 100) {
        confidence *= 0.5;
        reason += ' (reduced confidence due to poor GPS accuracy)';
        recommendation += ' Consider waiting for better GPS signal quality';
      }
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

    if (environment === 'indoor' && distance > driftLimits.warning && transportMode !== 'stationary') {
      confidence *= 0.7;
      reason += ' (indoor GPS less reliable)';
      recommendation += ' Indoor GPS has reduced accuracy';
    }

    if (previousLocation.accuracy > 100 || currentLocation.accuracy > 100) {
      confidence *= 0.5;
      reason += ' (reduced confidence due to poor GPS accuracy)';
      recommendation += ' Consider waiting for better GPS signal quality';
    }

    const platformAnalysis = this.analyzePlatformSpecifics(previousLocation, currentLocation, deviceInfo);
    const qualityFactors = this.analyzeQualityFactors(previousLocation, currentLocation, {
      accepted, distance, confidence, anomalyType
    });
    const contextualInsights = this.generateContextualInsights(
      { impliedSpeed: impliedSpeedKmh, anomalyType, accepted, confidence },
      contextHints,
      qualityFactors
    );

    const riskLevel = !accepted ? 'high' : confidence < 0.5 ? 'medium' : 'low';

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
      platformAnalysis,
      qualityFactors,
      contextualInsights,
      metadata: {
        processingTime: 0,
        maxAllowedSpeed: maxSpeed,
        actualSpeedRatio: Math.round((impliedSpeedKmh / maxSpeed) * 100) / 100,
        analysisVersion: '2.0.0',
        riskLevel
      }
    };
  }

  static analyzePlatformSpecifics(
    previousLocation: LocationReading, 
    currentLocation: LocationReading, 
    deviceInfo?: any
  ): { detectedPlatform: string; platformSpecificIssues: string[]; platformAdjustments: string[] } {
    const platform = deviceInfo?.platform || this.detectPlatformFromLocation(previousLocation, currentLocation);
    const issues: string[] = [];
    const adjustments: string[] = [];

    if (platform === 'ios') {
      if (previousLocation.accuracy > 20 || currentLocation.accuracy > 20) {
        issues.push('iOS accuracy reporting may be conservative');
        adjustments.push('Applied iOS accuracy compensation (+15% tolerance)');
      }
      if (deviceInfo?.batteryLevel && deviceInfo.batteryLevel < 20) {
        issues.push('Low battery may affect GPS precision on iOS');
        adjustments.push('Increased drift tolerance for low battery mode');
      }
      if (deviceInfo?.batteryLevel && deviceInfo.batteryLevel < 5) {
        issues.push('Critical battery level - GPS severely impacted');
        adjustments.push('Applied emergency power mode GPS tolerance');
      }
    } else if (platform === 'android') {
      if (currentLocation.timestamp - previousLocation.timestamp > 30000) {
        issues.push('Android may have delayed GPS updates');
        adjustments.push('Extended time tolerance for Android GPS updates');
      }
      if (deviceInfo?.connectionType === '2g' || deviceInfo?.connectionType === '3g') {
        issues.push('Slow network may affect location services');
        adjustments.push('Reduced network positioning expectations');
      }
    } else if (platform === 'web') {
      issues.push('Web geolocation has reduced precision');
      adjustments.push('Increased accuracy thresholds for web platform');
      if (previousLocation.accuracy > 100 || currentLocation.accuracy > 100) {
        issues.push('Browser location may use WiFi positioning');
        adjustments.push('Applied network positioning tolerance');
      }
      if (deviceInfo?.connectionType === 'wifi') {
        adjustments.push('WiFi positioning mode detected');
      }
    }

    return { detectedPlatform: platform, platformSpecificIssues: issues, platformAdjustments: adjustments };
  }

  static analyzeQualityFactors(
    previousLocation: LocationReading, 
    currentLocation: LocationReading, 
    analysisResult: any
  ): {
    signalQuality: 'excellent' | 'good' | 'fair' | 'poor';
    consistency: number;
    environmentSuitability: number;
    overallReliability: number;
  } {
    const avgAccuracy = (previousLocation.accuracy + currentLocation.accuracy) / 2;
    
    let signalQuality: 'excellent' | 'good' | 'fair' | 'poor';
    if (avgAccuracy <= 10) signalQuality = 'excellent';
    else if (avgAccuracy <= 25) signalQuality = 'good';
    else if (avgAccuracy <= 50) signalQuality = 'fair';
    else signalQuality = 'poor';

    const accuracyDiff = Math.abs(previousLocation.accuracy - currentLocation.accuracy);
    const consistency = Math.max(0, 1 - (accuracyDiff / Math.max(previousLocation.accuracy, currentLocation.accuracy)));

    const environmentSuitability = analysisResult.accepted ? 
      Math.max(0.5, 1 - (analysisResult.distance / 1000)) : 
      Math.max(0.1, analysisResult.confidence);

    const overallReliability = (
      (signalQuality === 'excellent' ? 1 : signalQuality === 'good' ? 0.8 : signalQuality === 'fair' ? 0.6 : 0.4) +
      consistency +
      environmentSuitability
    ) / 3;

    return { signalQuality, consistency, environmentSuitability, overallReliability };
  }

  static generateContextualInsights(
    analysisResult: any,
    contextHints?: any,
    qualityFactors?: any
  ): {
    movementPattern: 'stationary' | 'slow' | 'moderate' | 'fast' | 'erratic';
    environmentalFactors: string[];
    recommendations: string[];
  } {
    let movementPattern: 'stationary' | 'slow' | 'moderate' | 'fast' | 'erratic';
    const environmentalFactors: string[] = [];
    const recommendations: string[] = [];

    if (analysisResult.impliedSpeed < 1) {
      movementPattern = 'stationary';
    } else if (analysisResult.impliedSpeed < 10) {
      movementPattern = 'slow';
    } else if (analysisResult.impliedSpeed < 50) {
      movementPattern = 'moderate';
    } else if (analysisResult.impliedSpeed < 120) {
      movementPattern = 'fast';
    } else {
      movementPattern = 'erratic';
    }

    if (contextHints?.environment === 'indoor') {
      environmentalFactors.push('Indoor environment reduces GPS accuracy');
      recommendations.push('Consider using WiFi positioning indoors');
      if (qualityFactors?.signalQuality === 'poor') {
        recommendations.push('Switch to network-based positioning for indoor use');
      }
    }

    if (contextHints?.environment === 'urban') {
      environmentalFactors.push('Urban canyons may cause GPS multipath');
      recommendations.push('Enable high-accuracy mode in dense urban areas');
      if (movementPattern === 'erratic') {
        recommendations.push('GPS signals may bounce off buildings - use movement smoothing');
      }
    }

    if (contextHints?.environment === 'highway') {
      environmentalFactors.push('High-speed environment detected');
      if (movementPattern === 'fast') {
        recommendations.push('Increase location update frequency for highway use');
      }
    }

    if (qualityFactors?.signalQuality === 'poor') {
      environmentalFactors.push('Poor signal quality detected');
      recommendations.push('Move to area with better sky visibility');
      if (qualityFactors.consistency < 0.5) {
        recommendations.push('Wait for GPS signal to stabilize');
      }
    }

    if (analysisResult.anomalyType) {
      recommendations.push('Wait for GPS signal to stabilize before next reading');
      if (analysisResult.anomalyType === 'teleportation') {
        recommendations.push('Clear GPS cache and restart location services');
      }
    }

    if (movementPattern === 'erratic' && !analysisResult.accepted) {
      environmentalFactors.push('Unstable movement pattern detected');
      recommendations.push('Implement location smoothing or increase validation threshold');
    }

    if (qualityFactors?.overallReliability < 0.5) {
      recommendations.push('Consider alternative positioning methods');
    }

    return { movementPattern, environmentalFactors, recommendations };
  }

  private static detectPlatformFromLocation(prev: LocationReading, curr: LocationReading): string {
    if (prev.platform || curr.platform) {
      return prev.platform || curr.platform || 'unknown';
    }
    
    const avgAccuracy = (prev.accuracy + curr.accuracy) / 2;
    const hasAltitude = (prev.altitude !== null && prev.altitude !== undefined) || 
                       (curr.altitude !== null && curr.altitude !== undefined);
    
    if (avgAccuracy < 10 && hasAltitude) {
      return 'ios';
    } else if (avgAccuracy > 50) {
      return 'web';
    } else if (avgAccuracy < 25 && !hasAltitude) {
      return 'android';
    }
    return 'unknown';
  }

  private static getContextualMaxSpeed(transportMode: string, environment: string): number {
    let baseSpeed = this.DEFAULT_MAX_SPEEDS[transportMode] || this.DEFAULT_MAX_SPEEDS.unknown;

    if (transportMode === 'driving') {
      switch (environment) {
        case 'indoor': return 5;
        case 'urban': return Math.min(baseSpeed, 80);
        case 'highway': return Math.min(baseSpeed, 160);
        case 'rural': return Math.min(baseSpeed, 120);
        default: return baseSpeed;
      }
    }

    if (transportMode === 'walking' || transportMode === 'cycling') {
      if (environment === 'indoor') {
        return Math.min(baseSpeed, transportMode === 'walking' ? 8 : 15);
      }
    }

    if (transportMode === 'stationary') {
      return environment === 'indoor' ? 0.3 : 0.5;
    }

    return baseSpeed;
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
    const transportMode: string = contextHints?.transportMode || 'unknown';
    const environment: string = contextHints?.environment || 'unknown';

    let baseSpeed = this.getContextualMaxSpeed(transportMode, environment);

    return {
      recommended: baseSpeed,
      absolute: baseSpeed * 1.5,
      conservative: baseSpeed * 0.7,
      driftLimits: transportMode === 'stationary' ? this.GPS_DRIFT_LIMITS[environment] : undefined
    };
  }
}