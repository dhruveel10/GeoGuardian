import { LocationReading } from '../types/location';

export class LocationValidator {
  static validate(location: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (typeof location.latitude !== 'number') {
      errors.push('Latitude must be a number');
    } else if (location.latitude < -90 || location.latitude > 90) {
      errors.push('Latitude must be between -90 and 90');
    }

    if (typeof location.longitude !== 'number') {
      errors.push('Longitude must be a number');
    } else if (location.longitude < -180 || location.longitude > 180) {
      errors.push('Longitude must be between -180 and 180');
    }

    if (typeof location.accuracy !== 'number') {
      errors.push('Accuracy must be a number');
    } else if (location.accuracy < 0) {
      errors.push('Accuracy must be positive');
    }

    if (typeof location.timestamp !== 'number') {
      errors.push('Timestamp must be a number');
    } else if (location.timestamp < 0) {
      errors.push('Timestamp must be positive');
    }

    if (location.speed !== undefined && location.speed !== null) {
      if (typeof location.speed !== 'number' || location.speed < 0) {
        errors.push('Speed must be a positive number or null');
      }
    }

    if (location.heading !== undefined && location.heading !== null) {
      if (typeof location.heading !== 'number' || location.heading < 0 || location.heading >= 360) {
        errors.push('Heading must be between 0 and 359 degrees or null');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  static sanitize(location: any): LocationReading {
    return {
      latitude: Number(location.latitude),
      longitude: Number(location.longitude),
      accuracy: Number(location.accuracy),
      timestamp: Number(location.timestamp),
      speed: location.speed ? Number(location.speed) : null,
      heading: location.heading ? Number(location.heading) : null,
      altitude: location.altitude ? Number(location.altitude) : null,
      altitudeAccuracy: location.altitudeAccuracy ? Number(location.altitudeAccuracy) : null,
      platform: location.platform || 'unknown',
      source: location.source || 'gps'
    };
  }
}