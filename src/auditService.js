const db = require('./database');
const Joi = require('joi');

class AuditService {
  constructor() {
    this.userIdSchema = Joi.number().integer().positive().required();
  }

  validateUserId(userId) {
    const { error, value } = this.userIdSchema.validate(userId);
    if (error) {
      throw new Error(`Invalid user ID: ${error.details[0].message}`);
    }
    return value;
  }

  async generateFullAuditTrail(userId) {
    try {
      // Validate input
      const validUserId = this.validateUserId(userId);

      // Check if user exists
      const userExists = await db.userExists(validUserId);
      if (!userExists) {
        throw new Error(`User with ID ${validUserId} not found`);
      }

      // Get all audit components
      const [transactionHistory, fundTrail, auditSummary] = await Promise.all([
        db.getUserTransactionHistory(validUserId),
        db.getFundLegitimacyTrail(validUserId),
        db.getAuditSummary(validUserId)
      ]);

      // Process and format results
      const formattedTransactions = this.formatTransactionHistory(transactionHistory.rows);
      const formattedFundTrail = this.formatFundTrail(fundTrail.rows);
      const formattedSummary = this.formatAuditSummary(auditSummary.rows[0]);

      // Calculate additional metrics
      const metrics = this.calculateAuditMetrics(formattedTransactions, formattedFundTrail);

      return {
        userId: validUserId,
        auditTimestamp: new Date().toISOString(),
        summary: formattedSummary,
        metrics,
        transactionHistory: formattedTransactions,
        fundLegitimacyTrail: formattedFundTrail,
        recommendations: this.generateRecommendations(formattedSummary, metrics)
      };

    } catch (error) {
      console.error('Error generating audit trail:', error);
      throw error;
    }
  }

  formatTransactionHistory(transactions) {
    return transactions.map(tx => ({
      transactionId: tx.transactionid,
      type: tx.transactiontype,
      timestamp: tx.fulltimestamp,
      senderAmount: parseFloat(tx.senderamount) || 0,
      receiverAmount: parseFloat(tx.receiveramount) || 0,
      senderCurrency: tx.sendercurrency,
      receiverCurrency: tx.receivercurrency,
      senderId: tx.senderid,
      receiverId: tx.receiverid,
      balanceImpact: parseFloat(tx.balance_impact_base_currency) || 0,
      runningBalance: parseFloat(tx.running_balance) || 0,
      baseCurrency: tx.user_base_currency
    }));
  }

  formatFundTrail(fundTrail) {
    const trailMap = new Map();
    
    fundTrail.forEach(trail => {
      const key = `${trail.senderid}-${trail.receiverid}-${trail.transactionid}`;
      if (!trailMap.has(key)) {
        trailMap.set(key, {
          transactionId: trail.transactionid,
          senderId: trail.senderid,
          receiverId: trail.receiverid,
          amount: parseFloat(trail.senderamount) || 0,
          currency: trail.sendercurrency,
          timestamp: trail.fulltimestamp,
          trailDepth: trail.trail_depth,
          transactionPath: trail.transaction_path,
          userPath: trail.user_path,
          legitimacyStatus: trail.legitimacy_status,
          isOriginalSource: trail.is_original_source
        });
      }
    });

    return Array.from(trailMap.values()).sort((a, b) => a.trailDepth - b.trailDepth);
  }

  formatAuditSummary(summary) {
    if (!summary) {
      throw new Error('No audit summary data found');
    }

    return {
      userId: summary.userid,
      baseCurrency: summary.base_currency,
      currentBalance: parseFloat(summary.current_balance) || 0,
      calculatedBalance: parseFloat(summary.calculated_balance) || 0,
      balanceStatus: summary.balance_status,
      balanceDiscrepancy: Math.abs(
        (parseFloat(summary.current_balance) || 0) - 
        (parseFloat(summary.calculated_balance) || 0)
      )
    };
  }

  calculateAuditMetrics(transactions, fundTrail) {
    const totalTransactions = transactions.length;
    const deposits = transactions.filter(tx => tx.type === 'deposit');
    const withdrawals = transactions.filter(tx => tx.type === 'withdrawal');
    const transfers = transactions.filter(tx => tx.type === 'transfer');

    const totalDeposited = deposits.reduce((sum, tx) => sum + tx.balanceImpact, 0);
    const totalWithdrawn = Math.abs(withdrawals.reduce((sum, tx) => sum + tx.balanceImpact, 0));
    const totalTransferred = Math.abs(transfers.filter(tx => tx.balanceImpact < 0).reduce((sum, tx) => sum + tx.balanceImpact, 0));
    const totalReceived = transfers.filter(tx => tx.balanceImpact > 0).reduce((sum, tx) => sum + tx.balanceImpact, 0);

    const legitimateTrails = fundTrail.filter(trail => 
      trail.legitimacyStatus === 'LEGITIMATE_DEPOSIT' || 
      trail.legitimacyStatus === 'TRACEABLE_TO_DEPOSIT'
    );
    const unverifiedTrails = fundTrail.filter(trail => 
      trail.legitimacyStatus === 'UNVERIFIED_SOURCE'
    );

    return {
      totalTransactions,
      transactionBreakdown: {
        deposits: deposits.length,
        withdrawals: withdrawals.length,
        transfers: transfers.length
      },
      amountBreakdown: {
        totalDeposited: Math.round(totalDeposited * 100) / 100,
        totalWithdrawn: Math.round(totalWithdrawn * 100) / 100,
        totalTransferred: Math.round(totalTransferred * 100) / 100,
        totalReceived: Math.round(totalReceived * 100) / 100
      },
      fundLegitimacy: {
        totalTrails: fundTrail.length,
        legitimateTrails: legitimateTrails.length,
        unverifiedTrails: unverifiedTrails.length,
        legitimacyScore: fundTrail.length > 0 ? 
          Math.round((legitimateTrails.length / fundTrail.length) * 100) : 100
      }
    };
  }

  generateRecommendations(summary, metrics) {
    const recommendations = [];

    // Balance discrepancy check
    if (summary.balanceStatus === 'DISCREPANCY') {
      recommendations.push({
        type: 'CRITICAL',
        message: `Balance discrepancy detected: ${summary.balanceDiscrepancy.toFixed(2)} ${summary.baseCurrency}`,
        action: 'Review all transactions for potential errors or unauthorized changes'
      });
    }

    // Fund legitimacy check
    if (metrics.fundLegitimacy.legitimacyScore < 80) {
      recommendations.push({
        type: 'WARNING',
        message: `Low fund legitimacy score: ${metrics.fundLegitimacy.legitimacyScore}%`,
        action: 'Investigate unverified fund sources and request additional documentation'
      });
    }

    // High volume check
    if (metrics.totalTransactions > 100) {
      recommendations.push({
        type: 'INFO',
        message: `High transaction volume detected: ${metrics.totalTransactions} transactions`,
        action: 'Consider implementing additional monitoring for high-activity accounts'
      });
    }

    // Large withdrawal check
    const withdrawalRatio = summary.currentBalance > 0 ? 
      (metrics.amountBreakdown.totalWithdrawn / summary.currentBalance) : 0;
    
    if (withdrawalRatio > 0.8) {
      recommendations.push({
        type: 'WARNING',
        message: 'High withdrawal-to-balance ratio detected',
        action: 'Monitor for potential account closure or suspicious activity'
      });
    }

    // Edge case: Rapid transaction pattern detection
    if (metrics.totalTransactions > 10) {
      const avgTransactionsPerDay = metrics.totalTransactions / 30; // Assuming 30-day period
      if (avgTransactionsPerDay > 5) {
        recommendations.push({
          type: 'INFO',
          message: 'High transaction frequency detected',
          action: 'Consider implementing velocity checks and enhanced monitoring'
        });
      }
    }

    // Edge case: Currency conversion dependency
    const hasMultiCurrency = metrics.amountBreakdown.totalReceived > 0;
    if (hasMultiCurrency && metrics.fundLegitimacy.legitimacyScore < 100) {
      recommendations.push({
        type: 'INFO',
        message: 'Multi-currency transactions with unverified sources detected',
        action: 'Verify exchange rate accuracy and source documentation'
      });
    }

    return recommendations;
  }

  async getSimpleBalance(userId) {
    try {
      const validUserId = this.validateUserId(userId);
      const userExists = await db.userExists(validUserId);
      
      if (!userExists) {
        throw new Error(`User with ID ${validUserId} not found`);
      }

      const auditSummary = await db.getAuditSummary(validUserId);
      return this.formatAuditSummary(auditSummary.rows[0]);

    } catch (error) {
      console.error('Error getting user balance:', error);
      throw error;
    }
  }
}

module.exports = new AuditService();