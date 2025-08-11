import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'GeoGuardian API',
    version: '1.0.0'
  });
});

app.get('/api/v1/info', (req, res) => {
  res.json({
    service: 'GeoGuardian Location Filtering API',
    version: '1.0.0',
    endpoints: [
      'GET /health - Health check',
      'GET /api/v1/info - Service information',
      'POST /api/v1/location/test - Test location endpoint (coming next)'
    ],
    status: 'Development'
  });
});

app.use((req, res, next) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `${req.method} ${req.originalUrl} is not a valid endpoint`,
    availableEndpoints: ['/health', '/api/v1/info']
  });
});

app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err.message);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 GeoGuardian API running on http://localhost:${PORT}`);
  console.log(`📋 Health check: http://localhost:${PORT}/health`);
  console.log(`📖 API info: http://localhost:${PORT}/api/v1/info`);
});

export default app;