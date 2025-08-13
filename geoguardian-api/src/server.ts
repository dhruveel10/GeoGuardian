import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import locationRoutes from './routes/location';
import movementRoutes from './routes/movementAnalysis';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

app.use(helmet({
  contentSecurityPolicy: false 
}));
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'GeoGuardian API',
    version: '2.0.0'
  });
});

app.get('/api/v1/info', (req, res) => {
  res.json({
    service: 'GeoGuardian Location Filtering API',
    version: '2.0.0',
    endpoints: [
      'POST /api/v1/location/test - Single location quality analysis',
      'POST /api/v1/location/analyze-movement - Movement anomaly detection',
      'GET /api/v1/location/movement-limits - Speed limits for transport modes',
      'POST /api/v1/location/batch-movement-analysis - Analyze location sequences',
    ],
    features: [
      'Location quality analysis',
      'Movement anomaly detection',
      'GPS jump detection', 
      'Impossible speed validation',
      'Transport mode awareness',
      'Batch sequence analysis'
    ],
    status: 'Development'
  });
});

app.use('/api/v1/location', locationRoutes);
app.use('/api/v1/location', movementRoutes);

app.use((req, res, next) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `${req.method} ${req.originalUrl} is not a valid endpoint`,
    availableEndpoints: [
      '/health',
      '/api/v1/info',
      '/api/v1/location/test',
      '/api/v1/location/analyze-movement',
      '/api/v1/location/movement-limits',
      '/api/v1/location/batch-movement-analysis',
      '/api/v1/location/example'
    ]
  });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 GeoGuardian API v2.0 running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`📖 API info: http://localhost:${PORT}/api/v1/info`);
  console.log(`🏃 Movement analysis: http://localhost:${PORT}/api/v1/location/analyze-movement`);
});

export default app;