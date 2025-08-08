import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { testConnection } from './config/database.js';
import authRoutes from './routes/auth.js';
import facebookRoutes from './routes/facebook.js';
import startTokenRefreshJob from './services/tokenRefreshJob.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.NODE_ENV === 'production'
    ? [`${process.env.ORIGIN_1}`] 
    : ['http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Too many requests, please try again later' }
});
app.use('/api', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', async (req, res) => {
  const dbStatus = await testConnection();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus ? 'connected' : 'disconnected',
    environment: process.env.NODE_ENV
  });
});

// Basic routes
app.get('/', (req, res) => {
  res.json({
    message: 'Facebook-GHL Integration API',
    version: '1.0.0',
    status: 'running'
  });
});

// Future route imports (uncomment as you build them)
// import authRoutes from './routes/auth.js';
// import facebookRoutes from './routes/facebook.js';
// import ghlRoutes from './routes/ghl.js';
// import webhookRoutes from './routes/webhooks.js';

app.use('/api/auth', authRoutes);
app.use('/api/facebook', facebookRoutes);
// app.use('/api/ghl', ghlRoutes);
// app.use('/api/webhooks', webhookRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
const startServer = async () => {
  try {
    // Test database connection
    const dbConnected = await testConnection();
    if (!dbConnected) {
      console.error(' Cannot start server: Database connection failed');
      process.exit(1);
    }
    
    app.listen(port, () => {
      console.log(` Server running on port ${port}`);
      console.log(`Environment: ${process.env.NODE_ENV}`);
      console.log(` Health check: http://localhost:${port}/health`);
        
      // Start the token refresh cron job 
      startTokenRefreshJob();
    });
    
  } catch (error) {
    console.error(' Server startup failed:', error.message);
    process.exit(1);
  }
};

startServer();
