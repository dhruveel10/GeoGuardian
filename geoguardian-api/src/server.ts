import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import locationRoutes from './routes/location';
import movementRoutes from './routes/movementAnalysis';
import fusionRoutes from './routes/locationFusion';
import geofenceRoutes from './routes/geofenceEvaluation';
import adaptiveRoutes from './routes/adaptiveOptimization';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(helmet({
  contentSecurityPolicy: false 
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());
app.use(express.static('public'));

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'GeoGuardian API',
    version: '2.3.0',
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
      'POST /api/v1/smart/smart-fusion - Intelligent fusion with movement analysis',
      'GET /api/v1/smart/fusion-strategies - Available fusion strategies',
      'POST /api/v1/geofence/evaluate - Smart geofence boundary evaluation',
      'POST /api/v1/geofence/batch-evaluate - Batch geofence evaluations',
      'GET /api/v1/geofence/info - Geofence evaluation information',
      'GET /api/v1/geofence/test-scenarios - Common test scenarios',
      'POST /api/v1/adaptive/optimize - Pipeline optimization recommendations',
      'GET /api/v1/adaptive/strategies - Available optimization strategies',
      'GET /api/v1/adaptive/recommendations - Context-based recommendations',
      'POST /api/v1/adaptive/context-analysis - Analyze location context'
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
      'Smart fusion strategy selection',
      'Movement-based fusion decisions',
      'Intelligent geofence evaluation',
      'Adaptive buffer zones',
      'Multi-check verification',
      'Exit grace periods',
      'State transition management',
      'Pipeline optimization',
      'Context-aware mode selection',
      'Battery-aware adjustments',
      'Environment detection',
      'Movement pattern analysis'
    ],
    documentation: 'https://github.com/dhruveel10/geoguardian',
    status: 'Production'
  });
});

app.use('/api/v1/location', locationRoutes);
app.use('/api/v1/location', movementRoutes);
app.use('/api/v1/fusion', fusionRoutes);
app.use('/api/v1/geofence', geofenceRoutes);
app.use('/api/v1/adaptive', adaptiveRoutes);

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
      'POST /api/v1/geofence/batch-evaluate - Batch geofence evaluation',
      'GET /api/v1/geofence/info - Geofence information',
      'GET /api/v1/geofence/test-scenarios - Test scenarios',
      'POST /api/v1/adaptive/optimize - Pipeline optimization',
      'GET /api/v1/adaptive/strategies - Optimization strategies',
      'GET /api/v1/adaptive/recommendations - Context recommendations',
      'POST /api/v1/adaptive/context-analysis - Context analysis'
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
  console.log(`🚀 GeoGuardian API v2.3 running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`📖 API info: http://localhost:${PORT}/api/v1/info`);
  console.log(`📍 Location test: http://localhost:${PORT}/api/v1/location/test`);
  console.log(`🏃 Movement analysis: http://localhost:${PORT}/api/v1/location/analyze-movement`);
  console.log(`🔗 Location fusion: http://localhost:${PORT}/api/v1/fusion/fused`);
  console.log(`⚖️  Fusion comparison: http://localhost:${PORT}/api/v1/fusion/compare`);
  console.log(`🎯 Geofence evaluation: http://localhost:${PORT}/api/v1/geofence/evaluate`);
  console.log(`📊 Batch geofence: http://localhost:${PORT}/api/v1/geofence/batch-evaluate`);
  console.log(`⚙️  Pipeline optimization: http://localhost:${PORT}/api/v1/adaptive/optimize`);
  console.log(`🔧 Optimization strategies: http://localhost:${PORT}/api/v1/adaptive/strategies`);
  console.log(`🎯 Demo interface: http://localhost:${PORT}`);
});

export default app;