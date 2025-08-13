import { LocationReading, LocationQuality } from '../types/location';

export class LocationAnalyzer {
  static analyzeQuality(location: LocationReading): LocationQuality {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    if (location.accuracy > 200) {
      issues.push('Extremely poor GPS accuracy - unusable for any precise location services');
      recommendations.push('Move to an outdoor area with clear sky view and wait several minutes');
      score -= 85;
    } else if (location.accuracy > 100) {
      issues.push('Very poor GPS accuracy - unreliable for geofencing');
      recommendations.push('Move to an open area with clear sky view');
      score -= 70;
    } else if (location.accuracy > 50) {
      issues.push('Poor GPS accuracy - not suitable for precise location services');
      recommendations.push('Move outdoors or near a window for better GPS signal');
      score -= 55;
    } else if (location.accuracy > 30) {
      issues.push('Moderate GPS accuracy - use with caution');
      recommendations.push('Wait for GPS to stabilize or move to better location');
      score -= 35;
    } else if (location.accuracy > 15) {
      issues.push('Fair GPS accuracy');
      recommendations.push('Acceptable for most location services');
      score -= 20;
    } else if (location.accuracy > 10) {
      issues.push('Good GPS accuracy');
      score -= 10;
    } else if (location.accuracy > 5) {
      score -= 5;
    }

    const now = Date.now();
    const ageMinutes = (now - location.timestamp) / (1000 * 60);
    
    if (ageMinutes > 10) {
      issues.push('Location data is very stale');
      recommendations.push('Request fresh location reading immediately');
      score -= 40;
    } else if (ageMinutes > 5) {
      issues.push('Location data is stale');
      recommendations.push('Request fresh location reading');
      score -= 25;
    } else if (ageMinutes > 2) {
      issues.push('Location data is somewhat old');
      recommendations.push('Consider requesting fresh location');
      score -= 15;
    } else if (ageMinutes > 1) {
      issues.push('Location data is aging');
      score -= 5;
    }

    if (location.speed && location.speed > 100) {
      issues.push('Extremely high speed detected - GPS may be unreliable');
      recommendations.push('High-speed movement requires specialized GPS filtering');
      score -= 20;
    } else if (location.speed && location.speed > 50) {
      issues.push('High speed movement detected');
      recommendations.push('Consider using movement-aware filtering for accuracy');
      score -= 10;
    } else if (location.speed && location.speed > 25) {
      issues.push('Moderate speed movement detected');
      score -= 5;
    }

    if (location.platform === 'web') {
      if (location.accuracy <= 20) {
        score += 5;
      }
    }

    score = Math.max(0, Math.min(100, score));

    let grade: LocationQuality['grade'];
    if (score >= 90) {
      grade = 'excellent';      
    } else if (score >= 80) {
      grade = 'very-good';      
    } else if (score >= 65) {
      grade = 'good';           
    } else if (score >= 50) {
      grade = 'fair';          
    } else if (score >= 35) {
      grade = 'poor';           
    } else if (score >= 25) {
      grade = 'very-poor';      
    } else {
      grade = 'unusable';      
    }

    if (score < 35) {
      if (!recommendations.some(r => r.includes('not recommend'))) {
        recommendations.push('Not recommended for geofencing or precise location services');
      }
    } else if (score < 65) {
      if (!recommendations.some(r => r.includes('caution'))) {
        recommendations.push('Use with caution - verify location through alternative means if critical');
      }
    }

    if (location.accuracy > 50) {
      recommendations.push(`GPS uncertainty (±${Math.round(location.accuracy)}m) exceeds typical geofence radius`);
    }

    return { score, grade, issues, recommendations };
  }

  static detectPlatform(userAgent?: string): 'ios' | 'android' | 'web' | 'unknown' {
    if (!userAgent) return 'unknown';
    
    userAgent = userAgent.toLowerCase();
    
    if (userAgent.includes('iphone') || userAgent.includes('ipad') || userAgent.includes('ios')) {
      return 'ios';
    }
    
    if (userAgent.includes('android')) {
      return 'android';
    }
    
    return 'web';
  }

  static getAccuracyAssessment(accuracy: number): string {
    if (accuracy <= 3) return 'Survey-grade accuracy';
    if (accuracy <= 5) return 'Excellent accuracy';
    if (accuracy <= 10) return 'Very good accuracy';
    if (accuracy <= 15) return 'Good accuracy';
    if (accuracy <= 30) return 'Fair accuracy';
    if (accuracy <= 50) return 'Poor accuracy';
    if (accuracy <= 100) return 'Very poor accuracy';
    return 'Extremely poor accuracy';
  }

  static isSuitableForGeofencing(location: LocationReading, geofenceRadius: number = 50): {
    suitable: boolean;
    reason?: string;
    confidence: number;
  } {
    const quality = this.analyzeQuality(location);
    
    if (location.accuracy > geofenceRadius * 1.5) {
      return {
        suitable: false,
        reason: `GPS uncertainty (±${Math.round(location.accuracy)}m) is too large for ${geofenceRadius}m geofence`,
        confidence: 0
      };
    }
    
    if (quality.score < 35) {
      return {
        suitable: false,
        reason: 'Overall GPS quality too poor for reliable geofencing',
        confidence: quality.score / 100
      };
    }
    
    if (location.accuracy > geofenceRadius) {
      return {
        suitable: false,
        reason: `GPS uncertainty exceeds geofence radius`,
        confidence: Math.max(0.1, 1 - (location.accuracy - geofenceRadius) / geofenceRadius)
      };
    }
    
    return {
      suitable: true,
      confidence: Math.min(1.0, quality.score / 100)
    };
  }
}