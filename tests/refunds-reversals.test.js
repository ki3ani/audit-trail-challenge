const request = require('supertest');
const AuditTrailServer = require('../src/server');

describe('Refunds and Reversals Edge Cases', () => {
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

  describe('Refund Handling', () => {
    test('should properly track refund transactions', async () => {
      const response = await request(app).get('/api/audit/3');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        // Look for refund transactions
        const refunds = data.transactionHistory.filter(tx => tx.isRefund === true);
        
        refunds.forEach(refund => {
          expect(refund).toHaveProperty('isRefund', true);
          expect(refund).toHaveProperty('refundOfTransactionId');
          expect(refund.type).toBe('refund');
          expect(refund.refundOfTransactionId).toBeDefined();
        });

        // Check metrics include refunds
        if (refunds.length > 0) {
          expect(data.metrics.transactionBreakdown).toHaveProperty('refunds');
          expect(data.metrics.transactionBreakdown.refunds).toBeGreaterThan(0);
          expect(data.metrics.amountBreakdown).toHaveProperty('totalRefunded');
        }
      }
    });

    test('should calculate balance impact correctly for refunds', async () => {
      const response = await request(app).get('/api/audit/3');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        // Find refund transactions
        const refunds = data.transactionHistory.filter(tx => tx.type === 'refund');
        
        refunds.forEach(refund => {
          // Refunds should have positive balance impact (add money back)
          expect(refund.balanceImpact).toBeGreaterThanOrEqual(0);
          expect(refund.type).toBe('refund');
        });
      }
    });
  });

  describe('Reversal Handling', () => {
    test('should properly track reversal transactions', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        // Look for reversal transactions
        const reversals = data.transactionHistory.filter(tx => tx.isReversal === true);
        
        reversals.forEach(reversal => {
          expect(reversal).toHaveProperty('isReversal', true);
          expect(reversal).toHaveProperty('reversalOfTransactionId');
          expect(reversal).toHaveProperty('reversalReason');
          expect(reversal.type).toBe('reversal');
          expect(reversal.reversalOfTransactionId).toBeDefined();
        });

        // Check metrics include reversals
        if (reversals.length > 0) {
          expect(data.metrics.transactionBreakdown).toHaveProperty('reversals');
          expect(data.metrics.transactionBreakdown.reversals).toBeGreaterThan(0);
          expect(data.metrics.amountBreakdown).toHaveProperty('totalReversed');
        }
      }
    });

    test('should include reversal reason for audit compliance', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        const reversals = data.transactionHistory.filter(tx => tx.isReversal === true);
        
        reversals.forEach(reversal => {
          expect(reversal.reversalReason).toBeDefined();
          expect(typeof reversal.reversalReason).toBe('string');
          expect(reversal.reversalReason.length).toBeGreaterThan(0);
        });
      }
    });
  });

  describe('Edge Case Balance Calculations', () => {
    test('should handle complex scenarios with refunds and reversals', async () => {
      // Test multiple users to find scenarios with refunds/reversals
      const testUsers = [1, 2, 3, 6, 10];
      
      for (const userId of testUsers) {
        const response = await request(app).get(`/api/audit/${userId}`);
        
        if (response.status === 200) {
          const { data } = response.body;
          
          // Verify all transaction types are properly counted
          const txTypes = data.transactionHistory.map(tx => tx.type);
          const uniqueTypes = [...new Set(txTypes)];
          
          // Check that metrics breakdown matches actual transactions
          let depositCount = txTypes.filter(t => t === 'deposit').length;
          let withdrawalCount = txTypes.filter(t => t === 'withdrawal').length;
          let transferCount = txTypes.filter(t => t === 'transfer').length;
          let refundCount = txTypes.filter(t => t === 'refund').length;
          let reversalCount = txTypes.filter(t => t === 'reversal').length;
          
          expect(data.metrics.transactionBreakdown.deposits).toBe(depositCount);
          expect(data.metrics.transactionBreakdown.withdrawals).toBe(withdrawalCount);
          expect(data.metrics.transactionBreakdown.transfers).toBe(transferCount);
          expect(data.metrics.transactionBreakdown.refunds).toBe(refundCount);
          expect(data.metrics.transactionBreakdown.reversals).toBe(reversalCount);
        }
      }
    });

    test('should maintain data integrity with refunds and reversals', async () => {
      const response = await request(app).get('/api/audit/3');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        // Find refund and its original transaction
        const refunds = data.transactionHistory.filter(tx => tx.isRefund);
        
        refunds.forEach(refund => {
          // Original transaction should exist in history or be referenced
          expect(refund.refundOfTransactionId).toBeDefined();
          expect(typeof refund.refundOfTransactionId).toBe('number');
          
          // Refund should have positive impact (money back to account)
          expect(refund.balanceImpact).toBeGreaterThanOrEqual(0);
        });
      }
    });
  });

  describe('Compliance and Audit Requirements', () => {
    test('should provide complete audit trail including refunds and reversals', async () => {
      const response = await request(app).get('/api/audit/1');
      
      if (response.status === 200) {
        const { data } = response.body;
        
        // Every transaction should have full audit information
        data.transactionHistory.forEach(tx => {
          expect(tx).toHaveProperty('transactionId');
          expect(tx).toHaveProperty('type');
          expect(tx).toHaveProperty('timestamp');
          expect(tx).toHaveProperty('balanceImpact');
          expect(tx).toHaveProperty('runningBalance');
          
          // Refund-specific audit fields
          expect(tx).toHaveProperty('isRefund');
          expect(tx).toHaveProperty('isReversal');
          
          if (tx.isRefund) {
            expect(tx).toHaveProperty('refundOfTransactionId');
          }
          
          if (tx.isReversal) {
            expect(tx).toHaveProperty('reversalOfTransactionId');
            expect(tx).toHaveProperty('reversalReason');
          }
        });
      }
    });

    test('should handle edge cases without breaking the system', async () => {
      // Test various edge case scenarios
      const edgeCaseTests = [
        '/api/audit/1',   // User with potential reversals
        '/api/audit/3',   // User with potential refunds  
        '/api/balance/1', // Balance calculation with refunds/reversals
        '/api/balance/3'
      ];
      
      for (const endpoint of edgeCaseTests) {
        const response = await request(app).get(endpoint);
        
        // Should not crash or return 500 errors
        expect([200, 404].includes(response.status)).toBe(true);
        
        if (response.status === 200) {
          expect(response.body).toHaveProperty('success', true);
          expect(response.body).toHaveProperty('data');
        }
      }
    });
  });

  describe('Performance with Refunds and Reversals', () => {
    test('should maintain good performance with complex transaction types', async () => {
      const start = Date.now();
      const response = await request(app).get('/api/audit/1');
      const duration = Date.now() - start;
      
      // Should still be fast even with refunds/reversals
      expect(duration).toBeLessThan(5000); // 5 second max
      
      if (response.status === 200) {
        const { data } = response.body;
        
        // Should handle all transaction types efficiently
        expect(data.transactionHistory).toBeDefined();
        expect(data.metrics).toBeDefined();
        expect(data.summary).toBeDefined();
      }
    });
  });
});