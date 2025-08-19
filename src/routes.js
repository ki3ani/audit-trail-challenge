const express = require('express');
const auditService = require('./auditService');
const router = express.Router();

router.get('/api', (req, res) => {
  res.json({
    name: 'HoneyCoin Audit Trail API',
    version: '1.0.0',
    description: 'Advanced audit trail system for financial transaction tracking',
    endpoints: {
      'GET /api/audit/:userId': 'Get complete audit trail for a user',
      'GET /api/balance/:userId': 'Get user balance summary',
      'GET /api/health': 'Health check endpoint'
    },
    documentation: {
      auditTrail: {
        description: 'Returns comprehensive audit information including transaction history, fund legitimacy trail, and recommendations',
        parameters: {
          userId: 'integer - User ID to audit'
        },
        response: {
          userId: 'number',
          auditTimestamp: 'ISO datetime',
          summary: 'Balance and status information',
          metrics: 'Transaction and legitimacy metrics',
          transactionHistory: 'Array of all user transactions',
          fundLegitimacyTrail: 'Array showing fund source tracking',
          recommendations: 'Array of audit recommendations'
        }
      }
    }
  });
});

router.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'audit-trail-api'
  });
});

router.get('/api/audit/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({
        error: 'Invalid user ID',
        message: 'User ID must be a valid integer',
        code: 'INVALID_USER_ID'
      });
    }

    const auditTrail = await auditService.generateFullAuditTrail(userId);
    
    res.json({
      success: true,
      data: auditTrail,
      metadata: {
        generatedAt: new Date().toISOString(),
        apiVersion: '1.0.0'
      }
    });

  } catch (error) {
    console.error('Audit trail error:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'User not found',
        message: error.message,
        code: 'USER_NOT_FOUND'
      });
    }

    if (error.message.includes('Invalid user ID')) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.message,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while generating the audit trail',
      code: 'INTERNAL_ERROR'
    });
  }
});

router.get('/api/balance/:userId', async (req, res) => {
  try {
    const userId = parseInt(req.params.userId);
    
    if (isNaN(userId)) {
      return res.status(400).json({
        error: 'Invalid user ID',
        message: 'User ID must be a valid integer',
        code: 'INVALID_USER_ID'
      });
    }

    const balance = await auditService.getSimpleBalance(userId);
    
    res.json({
      success: true,
      data: balance,
      metadata: {
        generatedAt: new Date().toISOString(),
        apiVersion: '1.0.0'
      }
    });

  } catch (error) {
    console.error('Balance check error:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({
        error: 'User not found',
        message: error.message,
        code: 'USER_NOT_FOUND'
      });
    }

    if (error.message.includes('Invalid user ID')) {
      return res.status(400).json({
        error: 'Validation error',
        message: error.message,
        code: 'VALIDATION_ERROR'
      });
    }

    res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred while checking the balance',
      code: 'INTERNAL_ERROR'
    });
  }
});

// 404 handler
router.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    message: `The requested endpoint ${req.originalUrl} was not found`,
    code: 'ENDPOINT_NOT_FOUND',
    availableEndpoints: [
      'GET /api',
      'GET /api/health',
      'GET /api/audit/:userId',
      'GET /api/balance/:userId'
    ]
  });
});

module.exports = router;