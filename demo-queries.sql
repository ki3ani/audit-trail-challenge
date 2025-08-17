-- HoneyCoin Audit Trail System - Demo Queries
-- These queries demonstrate the advanced capabilities of the audit system

-- ================================================================================
-- DEMO 1: Complete audit for User 1 (shows multi-currency transactions)
-- ================================================================================

-- Check User 1's transaction history with running balance
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
    JOIN users u ON t.userid = u.userid
    WHERE t.userid = 1 -- User 1
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
            WHEN ut.transactiontype = 'transfer' AND ut.senderid = 1 THEN 
                CASE 
                    WHEN ut.sendercurrency = ut.user_base_currency THEN -ut.senderamount
                    ELSE -ut.senderamount * COALESCE(cc.conversionrate, 1.0)
                END
            WHEN ut.transactiontype = 'transfer' AND ut.receiverid = 1 THEN 
                CASE 
                    WHEN ut.receivercurrency = ut.user_base_currency THEN ut.receiveramount
                    ELSE ut.receiveramount * COALESCE(cc.conversionrate, 1.0)
                END
            ELSE 0
        END as balance_impact_base_currency
    FROM user_transactions ut
    LEFT JOIN currencyconversions cc ON 
        (ut.transactiontype IN ('deposit', 'withdrawal') AND cc.fromcurrency = ut.sendercurrency AND cc.tocurrency = ut.user_base_currency)
        OR (ut.transactiontype = 'transfer' AND ut.senderid = 1 AND cc.fromcurrency = ut.sendercurrency AND cc.tocurrency = ut.user_base_currency)
        OR (ut.transactiontype = 'transfer' AND ut.receiverid = 1 AND cc.fromcurrency = ut.receivercurrency AND cc.tocurrency = ut.user_base_currency)
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
    CASE 
        WHEN transactiontype = 'deposit' THEN 'Deposited ' || receiveramount || ' ' || receivercurrency
        WHEN transactiontype = 'withdrawal' THEN 'Withdrew ' || senderamount || ' ' || sendercurrency
        WHEN transactiontype = 'transfer' AND senderid = 1 THEN 'Sent ' || senderamount || ' ' || sendercurrency || ' to User ' || receiverid
        WHEN transactiontype = 'transfer' AND receiverid = 1 THEN 'Received ' || receiveramount || ' ' || receivercurrency || ' from User ' || senderid
    END as transaction_description,
    balance_impact_base_currency as impact_usd,
    running_balance as balance_usd,
    user_base_currency
FROM running_balance
ORDER BY fulltimestamp;

-- ================================================================================
-- DEMO 2: Fund legitimacy trail for User 1 (traces incoming transfers)
-- ================================================================================

WITH RECURSIVE fund_trail AS (
    -- Base case: Find all incoming transfers to User 1
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
        t.receiveramount as traced_amount,
        t.receivercurrency as traced_currency,
        false as is_original_source,
        'User ' || t.senderid || ' → User ' || t.receiverid as trail_description
    FROM transactions t
    WHERE t.receiverid = 1 -- User 1
    AND t.transactiontype = 'transfer'
    AND t.status = 'successful'
    
    UNION ALL
    
    -- Recursive case: Follow the chain backwards
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
            ELSE t.receiveramount * COALESCE(cc.conversionrate, 1.0)
        END as traced_amount,
        ft.traced_currency,
        CASE 
            WHEN t.transactiontype = 'deposit' THEN true
            ELSE false
        END as is_original_source,
        ft.trail_description || ' ← ' || 
        CASE 
            WHEN t.transactiontype = 'deposit' THEN 'DEPOSIT by User ' || t.receiverid
            ELSE 'User ' || t.senderid || ' → User ' || t.receiverid
        END
    FROM fund_trail ft
    JOIN transactions t ON t.receiverid = ft.senderid
    LEFT JOIN currencyconversions cc ON cc.fromcurrency = t.receivercurrency AND cc.tocurrency = ft.traced_currency
    WHERE ft.trail_depth < 10
    AND t.status = 'successful'
    AND t.fulltimestamp <= ft.fulltimestamp
    AND NOT (t.senderid = ANY(ft.user_path))
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
    trail_depth,
    legitimacy_status,
    traced_amount,
    traced_currency,
    trail_description,
    transaction_path,
    fulltimestamp,
    CASE 
        WHEN legitimacy_status = 'LEGITIMATE_DEPOSIT' THEN '✅ Verified - Original Deposit'
        WHEN legitimacy_status = 'TRACEABLE_TO_DEPOSIT' THEN '✅ Verified - Traceable to Deposit'
        WHEN legitimacy_status = 'UNVERIFIED_SOURCE' THEN '⚠️  Unverified - Cannot trace to deposit'
        WHEN legitimacy_status = 'MAX_DEPTH_REACHED' THEN '🔍 Investigation - Max depth reached'
    END as verification_status
FROM legitimate_sources
ORDER BY trail_depth, fulltimestamp;

-- ================================================================================
-- DEMO 3: Multi-user balance summary with legitimacy scores
-- ================================================================================

WITH user_balances AS (
    SELECT 
        u.userid,
        u.currency,
        u.balance as stored_balance,
        COALESCE(SUM(
            CASE 
                WHEN t.transactiontype = 'deposit' AND t.receiverid = u.userid THEN 
                    CASE WHEN t.receivercurrency = u.currency THEN t.receiveramount 
                         ELSE t.receiveramount * COALESCE(cc1.conversionrate, 1.0) END
                WHEN t.transactiontype = 'withdrawal' AND t.senderid = u.userid THEN 
                    CASE WHEN t.sendercurrency = u.currency THEN -t.senderamount 
                         ELSE -t.senderamount * COALESCE(cc2.conversionrate, 1.0) END
                WHEN t.transactiontype = 'transfer' AND t.senderid = u.userid THEN 
                    CASE WHEN t.sendercurrency = u.currency THEN -t.senderamount 
                         ELSE -t.senderamount * COALESCE(cc3.conversionrate, 1.0) END
                WHEN t.transactiontype = 'transfer' AND t.receiverid = u.userid THEN 
                    CASE WHEN t.receivercurrency = u.currency THEN t.receiveramount 
                         ELSE t.receiveramount * COALESCE(cc4.conversionrate, 1.0) END
                ELSE 0
            END
        ), 0) as calculated_balance
    FROM users u
    LEFT JOIN transactions t ON (t.userid = u.userid OR t.senderid = u.userid OR t.receiverid = u.userid) AND t.status = 'successful'
    LEFT JOIN currencyconversions cc1 ON cc1.fromcurrency = t.receivercurrency AND cc1.tocurrency = u.currency
    LEFT JOIN currencyconversions cc2 ON cc2.fromcurrency = t.sendercurrency AND cc2.tocurrency = u.currency
    LEFT JOIN currencyconversions cc3 ON cc3.fromcurrency = t.sendercurrency AND cc3.tocurrency = u.currency
    LEFT JOIN currencyconversions cc4 ON cc4.fromcurrency = t.receivercurrency AND cc4.tocurrency = u.currency
    GROUP BY u.userid, u.currency, u.balance
),

transaction_counts AS (
    SELECT 
        userid,
        COUNT(*) as total_transactions,
        COUNT(CASE WHEN transactiontype = 'deposit' THEN 1 END) as deposits,
        COUNT(CASE WHEN transactiontype = 'withdrawal' THEN 1 END) as withdrawals,
        COUNT(CASE WHEN transactiontype = 'transfer' THEN 1 END) as transfers
    FROM transactions 
    WHERE status = 'successful'
    GROUP BY userid
)

SELECT 
    ub.userid,
    ub.currency,
    ub.stored_balance,
    ub.calculated_balance,
    ROUND(ABS(ub.stored_balance - ub.calculated_balance), 2) as balance_discrepancy,
    CASE 
        WHEN ABS(ub.stored_balance - ub.calculated_balance) < 0.01 THEN '✅ BALANCED'
        ELSE '⚠️  DISCREPANCY' 
    END as balance_status,
    COALESCE(tc.total_transactions, 0) as total_transactions,
    COALESCE(tc.deposits, 0) as deposits,
    COALESCE(tc.withdrawals, 0) as withdrawals,
    COALESCE(tc.transfers, 0) as transfers
FROM user_balances ub
LEFT JOIN transaction_counts tc ON ub.userid = tc.userid
ORDER BY ub.userid;

-- ================================================================================
-- DEMO 4: Suspicious pattern detection
-- ================================================================================

-- Detect rapid transfer patterns (potential money laundering)
WITH transfer_patterns AS (
    SELECT 
        senderid,
        receiverid,
        COUNT(*) as transfer_count,
        SUM(senderamount) as total_amount,
        MIN(fulltimestamp) as first_transfer,
        MAX(fulltimestamp) as last_transfer,
        EXTRACT(EPOCH FROM (MAX(fulltimestamp) - MIN(fulltimestamp)))/3600 as hours_between
    FROM transactions
    WHERE transactiontype = 'transfer' 
    AND status = 'successful'
    GROUP BY senderid, receiverid
    HAVING COUNT(*) > 1
)

SELECT 
    'Rapid Transfers' as pattern_type,
    senderid,
    receiverid,
    transfer_count,
    total_amount,
    ROUND(hours_between, 2) as hours_between_first_last,
    CASE 
        WHEN transfer_count >= 3 AND hours_between < 24 THEN '🚨 HIGH RISK'
        WHEN transfer_count >= 2 AND hours_between < 1 THEN '⚠️  MEDIUM RISK'
        ELSE '📊 NORMAL'
    END as risk_level
FROM transfer_patterns
WHERE hours_between < 168 -- Within a week
ORDER BY risk_level DESC, transfer_count DESC;

-- ================================================================================
-- DEMO 5: Currency conversion impact analysis
-- ================================================================================

SELECT 
    'Currency Conversion Analysis' as analysis_type,
    sendercurrency,
    receivercurrency,
    COUNT(*) as conversion_count,
    AVG(receiveramount/senderamount) as avg_conversion_rate,
    SUM(senderamount) as total_sent,
    SUM(receiveramount) as total_received,
    ROUND((SUM(receiveramount) - SUM(senderamount * cc.conversionrate)) / SUM(senderamount * cc.conversionrate) * 100, 2) as rate_variance_percent
FROM transactions t
LEFT JOIN currencyconversions cc ON cc.fromcurrency = t.sendercurrency AND cc.tocurrency = t.receivercurrency
WHERE t.transactiontype = 'transfer'
AND t.sendercurrency != t.receivercurrency
AND t.status = 'successful'
GROUP BY sendercurrency, receivercurrency, cc.conversionrate
ORDER BY conversion_count DESC;