import { LocationReading, LocationQuality } from '../types/location';

export class LocationAnalyzer {
  static analyzeQuality(location: LocationReading): LocationQuality {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let score = 100;

    if (location.accuracy > 100) {
      issues.push('Very poor GPS accuracy');
      recommendations.push('Move to an open area with clear sky view');
      score -= 40;
    } else if (location.accuracy > 50) {
      issues.push('Poor GPS accuracy');
      recommendations.push('Wait for better GPS signal');
      score -= 25;
    } else if (location.accuracy > 20) {
      issues.push('Moderate GPS accuracy');
      score -= 10;
    }

    const now = Date.now();
    const ageMinutes = (now - location.timestamp) / (1000 * 60);
    
    if (ageMinutes > 5) {
      issues.push('Location data is stale');
      recommendations.push('Request fresh location reading');
      score -= 30;
    } else if (ageMinutes > 1) {
      issues.push('Location data is somewhat old');
      score -= 10;
    }

    if (location.speed && location.speed > 50) {
      issues.push('High speed movement detected');
      recommendations.push('Consider using movement filtering');
      score -= 5;
    }

    score = Math.max(0, Math.min(100, score));

    let grade: LocationQuality['grade'];
    if (score >= 80) grade = 'excellent';
    else if (score >= 60) grade = 'good';
    else if (score >= 40) grade = 'fair';
    else grade = 'poor';

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
}