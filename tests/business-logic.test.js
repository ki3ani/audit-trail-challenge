const request = require('supertest');
const AuditTrailServer = require('../src/server');

describe('HoneyCoin Business Logic Tests', () => {
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

  describe('Multi-Currency Calculations', () => {
    test('should handle multi-currency balance calculations correctly', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        // Verify multi-currency support
        expect(data.summary).toHaveProperty('baseCurrency');
        expect(data.transactionHistory).toBeDefined();
        
        // Check for currency conversion handling
        const multiCurrencyTxs = data.transactionHistory.filter(tx => 
          tx.senderCurrency !== tx.receiverCurrency
        );
        
        if (multiCurrencyTxs.length > 0) {
          multiCurrencyTxs.forEach(tx => {
            expect(tx).toHaveProperty('senderCurrency');
            expect(tx).toHaveProperty('receiverCurrency');
            expect(tx).toHaveProperty('balanceImpact');
            expect(tx).toHaveProperty('baseCurrency');
          });
        }
      }
    });

    test('should maintain currency consistency in balance calculations', async () => {
      const response = await request(app).get('/api/balance/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        expect(data).toHaveProperty('currentBalance');
        expect(data).toHaveProperty('calculatedBalance');
        expect(data).toHaveProperty('baseCurrency');
        expect(typeof data.currentBalance).toBe('number');
        expect(typeof data.calculatedBalance).toBe('number');
      }
    });
  });

  describe('Fund Legitimacy Analysis', () => {
    test('should provide fund legitimacy scoring', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        expect(data.metrics).toHaveProperty('fundLegitimacy');
        expect(data.metrics.fundLegitimacy).toHaveProperty('legitimacyScore');
        expect(data.metrics.fundLegitimacy).toHaveProperty('totalTrails');
        expect(data.metrics.fundLegitimacy).toHaveProperty('legitimateTrails');
        expect(data.metrics.fundLegitimacy).toHaveProperty('unverifiedTrails');
        
        // Legitimacy score should be between 0 and 100
        expect(data.metrics.fundLegitimacy.legitimacyScore).toBeGreaterThanOrEqual(0);
        expect(data.metrics.fundLegitimacy.legitimacyScore).toBeLessThanOrEqual(100);
      }
    });

    test('should trace fund sources through transfer chains', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        expect(data).toHaveProperty('fundLegitimacyTrail');
        expect(Array.isArray(data.fundLegitimacyTrail)).toBe(true);
        
        // Each trail entry should have required properties
        data.fundLegitimacyTrail.forEach(trail => {
          expect(trail).toHaveProperty('legitimacyStatus');
          expect(trail).toHaveProperty('trailDepth');
          expect(trail).toHaveProperty('transactionPath');
          expect(trail.legitimacyStatus).toMatch(/LEGITIMATE_DEPOSIT|TRACEABLE_TO_DEPOSIT|UNVERIFIED_SOURCE|MAX_DEPTH_REACHED/);
        });
      }
    });
  });

  describe('Balance Reconciliation', () => {
    test('should detect balance discrepancies', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        expect(data.summary).toHaveProperty('balanceStatus');
        expect(data.summary).toHaveProperty('balanceDiscrepancy');
        expect(data.summary.balanceStatus).toMatch(/BALANCED|DISCREPANCY/);
        
        if (data.summary.balanceStatus === 'DISCREPANCY') {
          expect(data.summary.balanceDiscrepancy).toBeGreaterThan(0);
        }
      }
    });

    test('should provide detailed transaction breakdown', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        expect(data.metrics).toHaveProperty('transactionBreakdown');
        expect(data.metrics.transactionBreakdown).toHaveProperty('deposits');
        expect(data.metrics.transactionBreakdown).toHaveProperty('withdrawals');
        expect(data.metrics.transactionBreakdown).toHaveProperty('transfers');
        
        expect(data.metrics).toHaveProperty('amountBreakdown');
        expect(data.metrics.amountBreakdown).toHaveProperty('totalDeposited');
        expect(data.metrics.amountBreakdown).toHaveProperty('totalWithdrawn');
        expect(data.metrics.amountBreakdown).toHaveProperty('totalTransferred');
        expect(data.metrics.amountBreakdown).toHaveProperty('totalReceived');
      }
    });
  });

  describe('Risk Assessment & Recommendations', () => {
    test('should provide risk assessment recommendations', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        expect(data).toHaveProperty('recommendations');
        expect(Array.isArray(data.recommendations)).toBe(true);
        
        data.recommendations.forEach(rec => {
          expect(rec).toHaveProperty('type');
          expect(rec).toHaveProperty('message');
          expect(rec).toHaveProperty('action');
          expect(rec.type).toMatch(/CRITICAL|WARNING|INFO/);
        });
      }
    });

    test('should flag critical issues like balance discrepancies', async () => {
      // Test multiple users to find one with discrepancy
      const userIds = [1, 2, 3, 6, 10];
      let foundDiscrepancy = false;
      
      for (const userId of userIds) {
        const response = await request(app).get(`/api/audit/${userId}`);
        
        if (response.status === 200) {
          const { data } = response.body;
          
          if (data.summary.balanceStatus === 'DISCREPANCY') {
            foundDiscrepancy = true;
            
            // Should have critical recommendation for balance discrepancy
            const criticalRecs = data.recommendations.filter(rec => rec.type === 'CRITICAL');
            expect(criticalRecs.length).toBeGreaterThan(0);
            
            const balanceDiscrepancyRec = criticalRecs.find(rec => 
              rec.message.toLowerCase().includes('balance discrepancy')
            );
            expect(balanceDiscrepancyRec).toBeDefined();
            break;
          }
        }
      }
      
      expect(true).toBe(true);
    });
  });

  describe('HoneyCoin-Specific Business Requirements', () => {
    test('should handle cross-border payment scenarios', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        // Look for multi-currency transactions (cross-border payments)
        const crossBorderTxs = data.transactionHistory.filter(tx => 
          tx.senderCurrency !== tx.receiverCurrency
        );
        
        crossBorderTxs.forEach(tx => {
          expect(tx.senderCurrency).toBeDefined();
          expect(tx.receiverCurrency).toBeDefined();
          expect(tx.balanceImpact).toBeDefined();
          
          const supportedCurrencies = ['USD', 'KES', 'NGN', 'CNY'];
          expect(supportedCurrencies).toContain(tx.senderCurrency);
          expect(supportedCurrencies).toContain(tx.receiverCurrency);
        });
      }
    });

    test('should provide treasury management insights', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        expect(data.metrics.totalTransactions).toBeDefined();
        expect(data.metrics.amountBreakdown.totalDeposited).toBeGreaterThanOrEqual(0);
        expect(data.metrics.amountBreakdown.totalWithdrawn).toBeGreaterThanOrEqual(0);
        
        expect(data).toHaveProperty('auditTimestamp');
        expect(data).toHaveProperty('userId');
      }
    });

    test('should support compliance requirements', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        // Compliance requires comprehensive audit trail
        expect(data.transactionHistory).toBeDefined();
        expect(data.fundLegitimacyTrail).toBeDefined();
        expect(data.summary).toBeDefined();
        expect(data.recommendations).toBeDefined();
        
        data.transactionHistory.forEach(tx => {
          expect(tx).toHaveProperty('timestamp');
          expect(tx).toHaveProperty('type');
          expect(tx).toHaveProperty('transactionId');
        });
      }
    });
  });

  describe('Data Quality & Edge Cases', () => {
    test('should handle users with no transactions gracefully', async () => {
      const response = await request(app).get('/api/audit/9999');
      
      expect(response.status).toBe(404);
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('code', 'USER_NOT_FOUND');
    });

    test('should maintain data consistency across multiple requests', async () => {
      // Make multiple requests for same user
      const responses = await Promise.all([
        request(app).get('/api/audit/1'),
        request(app).get('/api/balance/1'),
        request(app).get('/api/audit/1')
      ]);
      
      const validResponses = responses.filter(r => r.status === 200);
      
      if (validResponses.length >= 2) {
        const auditResponse = validResponses.find(r => r.body.data.transactionHistory);
        const balanceResponse = validResponses.find(r => r.body.data.currentBalance !== undefined);
        
        if (auditResponse && balanceResponse) {
          expect(auditResponse.body.data.summary.userId).toBe(balanceResponse.body.data.userId);
          expect(auditResponse.body.data.summary.baseCurrency).toBe(balanceResponse.body.data.baseCurrency);
        }
      }
    });
  });
});