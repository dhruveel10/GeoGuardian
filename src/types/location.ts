export interface LocationReading {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
  speed?: number | null;
  heading?: number | null;
  altitude?: number | null;
  altitudeAccuracy?: number | null;
  platform?: 'ios' | 'android' | 'web' | 'unknown';
  source?: 'gps' | 'network' | 'passive';
}

export interface LocationRequest {
  location: LocationReading;
  requestId?: string;
  userAgent?: string;
  metadata?: {
    batteryLevel?: number;
    connectionType?: string;
    deviceType?: string;
  };
}

export interface LocationResponse {
  success: boolean;
  data?: {
    received: LocationReading;
    processed: LocationReading;
    quality: LocationQuality;
    processingTime: number;
  };
  error?: string;
  requestId?: string;
}

export interface LocationQuality {
  score: number;
  grade: 'excellent' | 'very-good' | 'good' | 'fair' | 'poor' | 'very-poor' | 'unusable';
  issues: string[];
  recommendations: string[];
}