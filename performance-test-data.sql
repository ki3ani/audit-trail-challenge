-- Performance Testing Data Generator for HoneyCoin Audit Trail System
-- Simulates large-scale cross-border business operations

-- First, let's add more users to simulate HoneyCoin's customer base
INSERT INTO public.users (userid, balance, currency) VALUES
-- African market businesses
(6, 2500000.00, 'KES'),   -- Large Kenyan corporation
(7, 15000000.00, 'NGN'),  -- Nigerian trading company
(8, 450000.00, 'KES'),    -- Kenyan SME
(9, 8200000.00, 'NGN'),   -- Nigerian fintech startup
(10, 75000.00, 'USD'),    -- International business hub

-- Asian market expansion
(11, 320000.00, 'CNY'),   -- Chinese manufacturer
(12, 180000.00, 'CNY'),   -- Chinese supplier
(13, 95000.00, 'USD'),    -- Singapore hub
(14, 125000.00, 'USD'),   -- Hong Kong trading
(15, 67000.00, 'USD');    -- Regional distributor

-- Add more currency pairs for comprehensive testing
INSERT INTO public.currencyconversions (fromcurrency, tocurrency, conversionrate) VALUES
-- CNY conversions
('USD', 'CNY', 7.20),
('CNY', 'USD', 0.1389),
('KES', 'CNY', 0.048),
('CNY', 'KES', 20.83),
('NGN', 'CNY', 0.009),
('CNY', 'NGN', 111.11),

-- Cross-African rates
('KES', 'GHS', 0.067),    -- Kenya to Ghana
('GHS', 'KES', 14.93),    -- Ghana to Kenya
('NGN', 'GHS', 0.0075),   -- Nigeria to Ghana
('GHS', 'NGN', 133.33);   -- Ghana to Nigeria

-- Generate large dataset for performance testing
-- This creates a realistic HoneyCoin business scenario with high transaction volume

DO $$
DECLARE
    i INTEGER;
    sender_user INTEGER;
    receiver_user INTEGER;
    transaction_type VARCHAR(10);
    amount_usd NUMERIC(10,2);
    sender_curr VARCHAR(3);
    receiver_curr VARCHAR(3);
    conversion_rate NUMERIC(10,6);
    base_timestamp TIMESTAMP;
BEGIN
    -- Set starting point for transaction generation
    base_timestamp := '2024-01-01 00:00:00'::timestamp;
    
    -- Generate 10,000 transactions for performance testing
    FOR i IN 1..10000 LOOP
        -- Randomly select transaction type based on realistic business patterns
        IF random() < 0.1 THEN
            transaction_type := 'deposit';
        ELSIF random() < 0.15 THEN
            transaction_type := 'withdrawal';
        ELSE
            transaction_type := 'transfer';
        END IF;
        
        -- Select random users for realistic distribution
        sender_user := floor(random() * 15) + 1;
        receiver_user := floor(random() * 15) + 1;
        
        -- Ensure sender != receiver for transfers
        WHILE receiver_user = sender_user AND transaction_type = 'transfer' LOOP
            receiver_user := floor(random() * 15) + 1;
        END LOOP;
        
        -- Generate realistic transaction amounts (business-scale)
        amount_usd := (random() * 50000 + 100)::NUMERIC(10,2);
        
        -- Select currencies based on user base currency and realistic patterns
        CASE transaction_type
            WHEN 'deposit' THEN
                SELECT currency INTO sender_curr FROM users WHERE userid = sender_user;
                receiver_curr := sender_curr;
                
            WHEN 'withdrawal' THEN
                SELECT currency INTO sender_curr FROM users WHERE userid = sender_user;
                receiver_curr := sender_curr;
                
            WHEN 'transfer' THEN
                SELECT currency INTO sender_curr FROM users WHERE userid = sender_user;
                SELECT currency INTO receiver_curr FROM users WHERE userid = receiver_user;
                
                -- 30% chance of cross-currency transfer (realistic for international business)
                IF random() < 0.7 THEN
                    receiver_curr := sender_curr; -- Same currency transfer
                END IF;
        END CASE;
        
        -- Get conversion rate if needed
        conversion_rate := 1.0;
        IF sender_curr != receiver_curr THEN
            SELECT conversionrate INTO conversion_rate 
            FROM currencyconversions 
            WHERE fromcurrency = sender_curr AND tocurrency = receiver_curr;
            
            -- If no rate found, use inverse
            IF conversion_rate IS NULL THEN
                SELECT (1.0/conversionrate) INTO conversion_rate 
                FROM currencyconversions 
                WHERE fromcurrency = receiver_curr AND tocurrency = sender_curr;
            END IF;
            
            -- Default to 1.0 if still no rate (shouldn't happen with our data)
            IF conversion_rate IS NULL THEN
                conversion_rate := 1.0;
            END IF;
        END IF;
        
        -- Insert the transaction
        INSERT INTO public.transactions (
            transactionid, 
            transactiontype, 
            userid, 
            fulltimestamp, 
            status, 
            senderamount, 
            receiveramount, 
            sendercurrency, 
            receivercurrency, 
            senderid, 
            receiverid
        ) VALUES (
            i + 7, -- Start after existing transactions
            transaction_type,
            CASE WHEN transaction_type = 'transfer' THEN sender_user ELSE sender_user END,
            base_timestamp + (i * INTERVAL '5 minutes'), -- Spread transactions over time
            CASE WHEN random() < 0.95 THEN 'successful' ELSE 'failed' END, -- 95% success rate
            amount_usd,
            CASE WHEN sender_curr = receiver_curr THEN amount_usd 
                 ELSE (amount_usd * conversion_rate)::NUMERIC(10,2) END,
            sender_curr,
            receiver_curr,
            sender_user,
            CASE WHEN transaction_type = 'transfer' THEN receiver_user ELSE sender_user END
        );
        
        -- Commit every 1000 transactions to avoid long locks
        IF i % 1000 = 0 THEN
            COMMIT;
            RAISE NOTICE 'Generated % transactions...', i;
        END IF;
    END LOOP;
    
    RAISE NOTICE 'Generated 10,000 transactions for performance testing';
END $$;

-- Update statistics for query planner
ANALYZE transactions;
ANALYZE users;
ANALYZE currencyconversions;

-- Performance verification queries
SELECT 
    'Performance Test Data Summary' as summary,
    COUNT(*) as total_transactions,
    COUNT(DISTINCT userid) as active_users,
    COUNT(CASE WHEN transactiontype = 'transfer' THEN 1 END) as transfers,
    COUNT(CASE WHEN sendercurrency != receivercurrency THEN 1 END) as cross_currency_transactions,
    MIN(fulltimestamp) as earliest_transaction,
    MAX(fulltimestamp) as latest_transaction
FROM transactions;

-- Check distribution across users
SELECT 
    userid,
    COUNT(*) as transaction_count,
    SUM(CASE WHEN transactiontype = 'deposit' THEN 1 ELSE 0 END) as deposits,
    SUM(CASE WHEN transactiontype = 'withdrawal' THEN 1 ELSE 0 END) as withdrawals,
    SUM(CASE WHEN transactiontype = 'transfer' THEN 1 ELSE 0 END) as transfers
FROM transactions 
GROUP BY userid 
ORDER BY transaction_count DESC 
LIMIT 10;