-- Performance Optimization for Large Dataset Efficiency
-- Adds strategic indexes and query optimizations for 10,000+ transactions

-- ================================================================================
-- CRITICAL PERFORMANCE INDEXES
-- ================================================================================

-- Optimized index for recursive fund trail queries
CREATE INDEX IF NOT EXISTS idx_transactions_fund_trail 
ON transactions(receiverid, transactiontype, status, fulltimestamp, senderid);

-- Optimized index for transaction history queries  
CREATE INDEX IF NOT EXISTS idx_transactions_user_history
ON transactions(userid, senderid, receiverid, status, fulltimestamp);

-- Currency conversion lookup optimization
CREATE INDEX IF NOT EXISTS idx_currency_conversion_lookup
ON currencyconversions(fromcurrency, tocurrency, conversionrate);

-- Composite index for transfer tracking
CREATE INDEX IF NOT EXISTS idx_transactions_transfer_tracking
ON transactions(senderid, receiverid, transactiontype, status, fulltimestamp);

-- Time-based filtering for recent transactions
CREATE INDEX IF NOT EXISTS idx_transactions_recent
ON transactions(fulltimestamp DESC, status, transactiontype);

-- ================================================================================
-- QUERY PERFORMANCE VERIFICATION
-- ================================================================================

-- Analyze query performance with EXPLAIN
EXPLAIN (ANALYZE, BUFFERS) 
SELECT COUNT(*) 
FROM transactions t1
JOIN transactions t2 ON t1.receiverid = t2.senderid
WHERE t1.transactiontype = 'transfer' 
AND t1.status = 'successful'
AND t2.status = 'successful';

-- Check index usage
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch
FROM pg_stat_user_indexes 
WHERE tablename = 'transactions'
ORDER BY idx_tup_read DESC;

-- Vacuum and analyze for optimal performance
VACUUM ANALYZE transactions;
VACUUM ANALYZE users;
VACUUM ANALYZE currencyconversions;

COMMIT;