import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import locationRoutes from './routes/location';
import movementRoutes from './routes/movementAnalysis';
import fusionRoutes from './routes/locationFusion';
import geofenceRoutes from './routes/geofence';
import aiRoutes from './routes/aiAnalysis';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 5001;

app.use(helmet({
  contentSecurityPolicy: false 
}));
app.use(cors({
  origin: [
    'http://localhost:3000', 
    'http://127.0.0.1:3000', 
    'http://localhost:5173', 
    'http://127.0.0.1:5173',
    'https://geo-guardian-99dyxisjy-dhruveel10s-projects.vercel.app',
    /https:\/\/.*\.vercel\.app$/
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Access-Control-Allow-Origin'],
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json());
app.use(express.static('public'));

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'GeoGuardian API',
    version: '2.2.0',
    uptime: process.uptime()
  });
});

app.get('/api/v1/info', (req, res) => {
  res.json({
    service: 'GeoGuardian Location Processing API',
    version: '2.3.0',
    endpoints: [
      'POST /api/v1/location/test - Single location quality analysis',
      'POST /api/v1/location/analyze-movement - Movement anomaly detection',
      'GET /api/v1/location/movement-limits - Speed limits for transport modes',
      'POST /api/v1/fusion/fused - Location fusion with filtering',
      'POST /api/v1/fusion/compare - Raw vs fused comparison',
      'GET /api/v1/fusion/fusion-info - Fusion algorithms info',
      'POST /api/v1/geofence/evaluate - Smart geofence evaluation',
      'POST /api/v1/geofence/validate - Batch geofence validation',
      'GET /api/v1/geofence/info - Geofence capabilities and strategies',
      'GET /api/v1/geofence/zones/calculate - Zone calculation helper',
      'POST /api/v1/ai/validate-location - AI location plausibility validation',
      'POST /api/v1/ai/explain-anomaly - AI movement anomaly explanation',
      'POST /api/v1/ai/optimize-geofence - AI geofence optimization'
    ],
    features: [
      'Location quality analysis',
      'Movement anomaly detection',
      'GPS jump detection', 
      'Impossible speed validation',
      'Platform-aware adjustments',
      'Context-aware filtering',
      'Location fusion & correction',
      'Weighted averaging',
      'Kalman filtering',
      'Real-time comparison',
      'Smart geofencing',
      'Multi-zone buffer system',
      'Grace period management',
      'Platform-specific optimizations',
      'Auto-fusion integration',
      'Movement-aware evaluation',
      'AI-powered location validation',
      'AI anomaly explanation',
      'AI geofence optimization'
    ],
    newInV2_3: [
      'AI-powered location plausibility validation',
      'Natural language anomaly explanations',
      'AI-driven geofence optimization',
      'Context-aware location correction',
      'Intelligent fusion decision making'
    ],
    documentation: 'https://github.com/dhruveel10/geoguardian',
    status: 'Production'
  });
});

app.use('/api/v1/location', locationRoutes);
app.use('/api/v1/location', movementRoutes);
app.use('/api/v1/fusion', fusionRoutes);
app.use('/api/v1/geofence', geofenceRoutes);
app.use('/api/v1/ai', aiRoutes);

app.use((req, res, next) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `${req.method} ${req.originalUrl} is not a valid endpoint`,
    availableEndpoints: [
      'GET /health - Health check',
      'GET /api/v1/info - API information', 
      'POST /api/v1/location/test - Location quality analysis',
      'POST /api/v1/location/analyze-movement - Movement analysis',
      'GET /api/v1/location/movement-limits - Movement limits',
      'POST /api/v1/fusion/fused - Location fusion',
      'POST /api/v1/fusion/compare - Fusion comparison',
      'GET /api/v1/fusion/fusion-info - Fusion information',
      'POST /api/v1/geofence/evaluate - Geofence evaluation',
      'POST /api/v1/geofence/validate - Geofence validation',
      'GET /api/v1/geofence/info - Geofence information',
      'GET /api/v1/geofence/zones/calculate - Zone calculation',
      'POST /api/v1/ai/validate-location - AI location validation',
      'POST /api/v1/ai/explain-anomaly - AI anomaly explanation',
      'POST /api/v1/ai/optimize-geofence - AI geofence optimization'
    ]
  });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
    timestamp: new Date().toISOString()
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 GeoGuardian API v2.2 running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`📖 API info: http://localhost:${PORT}/api/v1/info`);
  console.log(`📍 Location test: http://localhost:${PORT}/api/v1/location/test`);
  console.log(`🏃 Movement analysis: http://localhost:${PORT}/api/v1/location/analyze-movement`);
  console.log(`🔗 Location fusion: http://localhost:${PORT}/api/v1/fusion/fused`);
  console.log(`⚖️  Fusion comparison: http://localhost:${PORT}/api/v1/fusion/compare`);
  console.log(`🎯 Geofence evaluation: http://localhost:${PORT}/api/v1/geofence/evaluate`);
  console.log(`🛡️  Geofence validation: http://localhost:${PORT}/api/v1/geofence/validate`);
  console.log(`📊 Zone calculator: http://localhost:${PORT}/api/v1/geofence/zones/calculate`);
  console.log(`🎮 Demo interface: http://localhost:${PORT}`);
});

export default app;