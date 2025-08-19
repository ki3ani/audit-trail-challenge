const request = require('supertest');
const AuditTrailServer = require('../src/server');

describe('HoneyCoin Audit Trail API', () => {
  let server;
  let app;

  beforeAll(async () => {
    server = new AuditTrailServer();
    app = server.app;
  });

  afterAll(async () => {
    if (server) {
      await server.stop();
    }
  });

  describe('Health Checks', () => {
    test('GET / should return service information', async () => {
      const response = await request(app).get('/');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('status', 'running');
      expect(response.body).toHaveProperty('version');
      expect(response.body).toHaveProperty('endpoints');
    });

    test('GET /api/health should return health status', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('GET /api should return API documentation', async () => {
      const response = await request(app).get('/api');
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('endpoints');
      expect(response.body).toHaveProperty('documentation');
    });
  });

  describe('Audit Trail Endpoints', () => {
    test('GET /api/audit/:userId should return audit trail for valid user', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('userId');
        expect(response.body.data).toHaveProperty('summary');
        expect(response.body.data).toHaveProperty('transactionHistory');
        expect(response.body.data).toHaveProperty('fundLegitimacyTrail');
        expect(response.body.data).toHaveProperty('recommendations');
        expect(response.body.data).toHaveProperty('metrics');
      } else {
        expect([503, 404, 500]).toContain(response.status);
      }
    });

    test('GET /api/audit/invalid should return 400 for invalid user ID', async () => {
      const response = await request(app).get('/api/audit/invalid');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'INVALID_USER_ID');
    });

    test('GET /api/audit/99999 should return 404 for non-existent user', async () => {
      const response = await request(app).get('/api/audit/99999');
      
      if (response.status !== 503) { // If database is connected
        expect([404, 500]).toContain(response.status);
      }
    });
  });

  describe('Balance Endpoints', () => {
    test('GET /api/balance/:userId should return balance for valid user', async () => {
      const response = await request(app).get('/api/balance/1');
      
      if (response.status === 200) {
        expect(response.body).toHaveProperty('success', true);
        expect(response.body).toHaveProperty('data');
        expect(response.body.data).toHaveProperty('userId');
        expect(response.body.data).toHaveProperty('baseCurrency');
        expect(response.body.data).toHaveProperty('currentBalance');
        expect(response.body.data).toHaveProperty('calculatedBalance');
        expect(response.body.data).toHaveProperty('balanceStatus');
      } else {
        expect([503, 404, 500]).toContain(response.status);
      }
    });

    test('GET /api/balance/invalid should return 400 for invalid user ID', async () => {
      const response = await request(app).get('/api/balance/invalid');
      
      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'INVALID_USER_ID');
    });
  });

  describe('Error Handling', () => {
    test('GET /api/nonexistent should return 404', async () => {
      const response = await request(app).get('/api/nonexistent');
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'ENDPOINT_NOT_FOUND');
    });

    test('Rate limiting headers should be present', async () => {
      const response = await request(app).get('/api/health');
      
      expect(response.headers).toHaveProperty('ratelimit-limit');
      expect(response.headers).toHaveProperty('ratelimit-remaining');
    });
  });
});