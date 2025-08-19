const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const routes = require('./routes');
require('dotenv').config();

class AuditTrailServer {
  constructor() {
    this.app = express();
    this.port = process.env.PORT || 3000;
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  setupMiddleware() {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"]
        }
      }
    }));

    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://honeycoin.com', 'https://app.honeycoin.com'] 
        : true,
      credentials: true,
      optionsSuccessStatus: 200
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests',
        message: 'Rate limit exceeded. Please try again later.',
        code: 'RATE_LIMIT_EXCEEDED'
      },
      standardHeaders: true,
      legacyHeaders: false
    });

    this.app.use('/api', limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
      });
      next();
    });
  }

  setupRoutes() {
    this.app.get('/', (req, res) => {
      res.json({
        service: 'HoneyCoin Audit Trail API',
        status: 'running',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
          documentation: '/api',
          health: '/api/health',
          audit: '/api/audit/:userId',
          balance: '/api/balance/:userId'
        }
      });
    });

    // API routes
    this.app.use('/', routes);
  }

  setupErrorHandling() {
    this.app.use((error, req, res, next) => {
      console.error('Unhandled error:', error);

      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return res.status(503).json({
          error: 'Service unavailable',
          message: 'Database connection failed',
          code: 'DATABASE_CONNECTION_ERROR'
        });
      }

      // SQL errors
      if (error.code && error.code.startsWith('42')) {
        return res.status(500).json({
          error: 'Database error',
          message: 'A database query error occurred',
          code: 'DATABASE_QUERY_ERROR'
        });
      }

      res.status(500).json({
        error: 'Internal server error',
        message: 'An unexpected error occurred',
        code: 'INTERNAL_ERROR'
      });
    });

    process.on('uncaughtException', (error) => {
      console.error('Uncaught Exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }

  async start() {
    try {
      // Test database connection
      const db = require('./database');
      await db.query('SELECT 1');
      console.log('Database connection established');

      this.server = this.app.listen(this.port, () => {
        console.log(`🚀 HoneyCoin Audit Trail API running on port ${this.port}`);
        console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`🔗 API Documentation: http://localhost:${this.port}/api`);
        console.log('🔧 Ready to process audit requests');
      });

    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  async stop() {
    if (this.server) {
      this.server.close();
      console.log('Server stopped');
    }

    const db = require('./database');
    await db.close();
    console.log('Database connections closed');
  }
}

if (require.main === module) {
  const server = new AuditTrailServer();
  server.start();

  process.on('SIGTERM', async () => {
    console.log('SIGTERM received, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received, shutting down gracefully');
    await server.stop();
    process.exit(0);
  });
}

module.exports = AuditTrailServer;