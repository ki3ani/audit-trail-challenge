const { Pool } = require('pg');
require('dotenv').config();

class DatabaseManager {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'honeycoin',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
      process.exit(-1);
    });
  }

  async query(text, params) {
    const start = Date.now();
    try {
      // Add query timeout for large dataset protection
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout: exceeded 10 seconds')), 10000);
      });
      
      const queryPromise = this.pool.query(text, params);
      const res = await Promise.race([queryPromise, timeoutPromise]);
      
      const duration = Date.now() - start;
      console.log('Executed query', { 
        text: text.substring(0, 100), 
        duration, 
        rows: res.rowCount,
        performance: duration < 1000 ? 'excellent' : duration < 3000 ? 'good' : 'needs_optimization'
      });
      return res;
    } catch (error) {
      const duration = Date.now() - start;
      console.error('Database query error:', { 
        text: text.substring(0, 100), 
        error: error.message,
        duration 
      });
      throw error;
    }
  }

  async getUserTransactionHistory(userId) {
    const query = `
      WITH user_transactions AS (
        SELECT 
          t.transactionid,
          t.transactiontype,
          t.fulltimestamp,
          t.senderamount,
          t.receiveramount,
          t.sendercurrency,
          t.receivercurrency,
          t.senderid,
          t.receiverid,
          u.currency as user_base_currency
        FROM transactions t
        JOIN users u ON u.userid = $1
        WHERE (
          -- User initiated the transaction (deposits, withdrawals)
          (t.transactiontype IN ('deposit', 'withdrawal') AND t.userid = $1)
          -- OR user is sender in a transfer
          OR (t.transactiontype = 'transfer' AND t.senderid = $1)
          -- OR user is receiver in a transfer
          OR (t.transactiontype = 'transfer' AND t.receiverid = $1)
        )
        AND t.status = 'successful'
        ORDER BY t.fulltimestamp
      ),
      
      transaction_impacts AS (
        SELECT 
          ut.*,
          CASE 
            WHEN ut.transactiontype = 'deposit' THEN 
              CASE 
                WHEN ut.receivercurrency = ut.user_base_currency THEN ut.receiveramount
                ELSE ut.receiveramount * COALESCE(cc.conversionrate, 1.0)
              END
            WHEN ut.transactiontype = 'withdrawal' THEN 
              CASE 
                WHEN ut.sendercurrency = ut.user_base_currency THEN -ut.senderamount
                ELSE -ut.senderamount * COALESCE(cc.conversionrate, 1.0)
              END
            WHEN ut.transactiontype = 'transfer' AND ut.senderid = $1 THEN 
              CASE 
                WHEN ut.sendercurrency = ut.user_base_currency THEN -ut.senderamount
                ELSE -ut.senderamount * COALESCE(cc.conversionrate, 1.0)
              END
            WHEN ut.transactiontype = 'transfer' AND ut.receiverid = $1 THEN 
              CASE 
                WHEN ut.receivercurrency = ut.user_base_currency THEN ut.receiveramount
                ELSE ut.receiveramount * COALESCE(cc.conversionrate, 1.0)
              END
            ELSE 0
          END as balance_impact_base_currency
        FROM user_transactions ut
        LEFT JOIN currencyconversions cc ON 
          (ut.transactiontype = 'deposit' AND cc.fromcurrency = ut.receivercurrency AND cc.tocurrency = ut.user_base_currency)
          OR (ut.transactiontype = 'withdrawal' AND cc.fromcurrency = ut.sendercurrency AND cc.tocurrency = ut.user_base_currency)
          OR (ut.transactiontype = 'transfer' AND ut.senderid = $1 AND cc.fromcurrency = ut.sendercurrency AND cc.tocurrency = ut.user_base_currency)
          OR (ut.transactiontype = 'transfer' AND ut.receiverid = $1 AND cc.fromcurrency = ut.receivercurrency AND cc.tocurrency = ut.user_base_currency)
      ),
      
      running_balance AS (
        SELECT 
          *,
          SUM(balance_impact_base_currency) OVER (ORDER BY fulltimestamp) as running_balance
        FROM transaction_impacts
      )
      
      SELECT 
        transactionid,
        transactiontype,
        fulltimestamp,
        senderamount,
        receiveramount,
        sendercurrency,
        receivercurrency,
        senderid,
        receiverid,
        balance_impact_base_currency,
        running_balance,
        user_base_currency
      FROM running_balance
      ORDER BY fulltimestamp DESC
      LIMIT 100;  -- Limit for performance with high-volume users
    `;

    return await this.query(query, [userId]);
  }

  async getFundLegitimacyTrail(userId) {
    const query = `
      WITH RECURSIVE fund_trail AS (
        -- OPTIMIZED BASE CASE: Limit scope with time filtering and result limits
        SELECT 
          t.transactionid,
          t.senderid,
          t.receiverid,
          t.senderamount,
          t.receiveramount,
          t.sendercurrency,
          t.receivercurrency,
          t.fulltimestamp,
          t.transactiontype,
          1 as trail_depth,
          ARRAY[t.transactionid] as transaction_path,
          ARRAY[t.senderid, t.receiverid] as user_path,
          t.receiveramount::numeric(10,2) as traced_amount,
          t.receivercurrency as traced_currency,
          false as is_original_source
        FROM transactions t
        WHERE t.receiverid = $1
        AND t.transactiontype = 'transfer'
        AND t.status = 'successful'
        AND t.fulltimestamp > (CURRENT_DATE - INTERVAL '6 months') -- Aggressive time limit for performance
        
        UNION ALL
        
        -- OPTIMIZED RECURSIVE CASE: Reduced depth and better filtering
        SELECT 
          t.transactionid,
          t.senderid,
          t.receiverid,
          t.senderamount,
          t.receiveramount,
          t.sendercurrency,
          t.receivercurrency,
          t.fulltimestamp,
          t.transactiontype,
          ft.trail_depth + 1,
          ft.transaction_path || t.transactionid,
          ft.user_path || t.senderid,
          CASE 
            WHEN t.receivercurrency = ft.traced_currency THEN t.receiveramount
            ELSE (t.receiveramount * COALESCE(cc.conversionrate, 1.0))::numeric(10,2)
          END as traced_amount,
          ft.traced_currency,
          CASE 
            WHEN t.transactiontype = 'deposit' THEN true
            ELSE false
          END as is_original_source
        FROM fund_trail ft
        JOIN transactions t ON t.receiverid = ft.senderid
        LEFT JOIN currencyconversions cc ON cc.fromcurrency = t.receivercurrency AND cc.tocurrency = ft.traced_currency
        WHERE ft.trail_depth < 3  -- Further reduced for large dataset performance
        AND t.status = 'successful'
        AND t.fulltimestamp <= ft.fulltimestamp
        AND t.fulltimestamp > (CURRENT_DATE - INTERVAL '6 months') -- Same aggressive time limit
        AND NOT (t.senderid = ANY(ft.user_path))
        AND array_length(ft.user_path, 1) < 20  -- Prevent excessive path lengths
      ),
      
      legitimate_sources AS (
        SELECT 
          ft.*,
          CASE 
            WHEN ft.is_original_source THEN 'LEGITIMATE_DEPOSIT'
            WHEN ft.trail_depth >= 10 THEN 'MAX_DEPTH_REACHED'
            WHEN EXISTS (
              SELECT 1 FROM fund_trail ft2 
              WHERE ft2.senderid = ft.senderid 
              AND ft2.is_original_source = true
              AND ft2.traced_currency = ft.traced_currency
            ) THEN 'TRACEABLE_TO_DEPOSIT'
            ELSE 'UNVERIFIED_SOURCE'
          END as legitimacy_status
        FROM fund_trail ft
      )
      
      SELECT 
        transactionid,
        senderid,
        receiverid,
        senderamount,
        receiveramount,
        sendercurrency,
        receivercurrency,
        fulltimestamp,
        trail_depth,
        transaction_path,
        user_path,
        traced_amount,
        traced_currency,
        legitimacy_status,
        is_original_source
      FROM legitimate_sources
      ORDER BY trail_depth, fulltimestamp
      LIMIT 20;  -- Aggressive limit for large dataset performance
    `;

    return await this.query(query, [userId]);
  }

  async getAuditSummary(userId) {
    const query = `
      WITH user_summary AS (
        SELECT 
          u.userid,
          u.currency as base_currency,
          u.balance as current_balance
        FROM users u
        WHERE u.userid = $1
      ),
      
      balance_calculation AS (
        SELECT 
          COALESCE(SUM(
            CASE 
              WHEN t.transactiontype = 'deposit' THEN 
                CASE 
                  WHEN t.receivercurrency = us.base_currency THEN t.receiveramount
                  ELSE t.receiveramount * COALESCE(cc1.conversionrate, 1.0)
                END
              WHEN t.transactiontype = 'withdrawal' THEN 
                CASE 
                  WHEN t.sendercurrency = us.base_currency THEN -t.senderamount
                  ELSE -t.senderamount * COALESCE(cc2.conversionrate, 1.0)
                END
              WHEN t.transactiontype = 'transfer' AND t.senderid = $1 THEN 
                CASE 
                  WHEN t.sendercurrency = us.base_currency THEN -t.senderamount
                  ELSE -t.senderamount * COALESCE(cc3.conversionrate, 1.0)
                END
              WHEN t.transactiontype = 'transfer' AND t.receiverid = $1 THEN 
                CASE 
                  WHEN t.receivercurrency = us.base_currency THEN t.receiveramount
                  ELSE t.receiveramount * COALESCE(cc4.conversionrate, 1.0)
                END
              ELSE 0
            END
          ), 0) as calculated_balance
        FROM user_summary us
        LEFT JOIN transactions t ON (
          (t.transactiontype IN ('deposit', 'withdrawal') AND t.userid = $1)
          OR (t.transactiontype = 'transfer' AND t.senderid = $1)
          OR (t.transactiontype = 'transfer' AND t.receiverid = $1)
        )
        LEFT JOIN currencyconversions cc1 ON cc1.fromcurrency = t.receivercurrency AND cc1.tocurrency = us.base_currency
        LEFT JOIN currencyconversions cc2 ON cc2.fromcurrency = t.sendercurrency AND cc2.tocurrency = us.base_currency
        LEFT JOIN currencyconversions cc3 ON cc3.fromcurrency = t.sendercurrency AND cc3.tocurrency = us.base_currency
        LEFT JOIN currencyconversions cc4 ON cc4.fromcurrency = t.receivercurrency AND cc4.tocurrency = us.base_currency
        WHERE t.status = 'successful' OR t.status IS NULL
      )
      
      SELECT 
        us.userid,
        us.base_currency,
        us.current_balance,
        bc.calculated_balance,
        CASE 
          WHEN ABS(us.current_balance - bc.calculated_balance) < 0.01 THEN 'BALANCED'
          ELSE 'DISCREPANCY'
        END as balance_status
      FROM user_summary us
      CROSS JOIN balance_calculation bc;
    `;

    return await this.query(query, [userId]);
  }

  async userExists(userId) {
    const query = 'SELECT userid FROM users WHERE userid = $1';
    const result = await this.query(query, [userId]);
    return result.rows.length > 0;
  }

  async close() {
    await this.pool.end();
  }
}

module.exports = new DatabaseManager();