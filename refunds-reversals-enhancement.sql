-- Refunds and Reversals Enhancement for HoneyCoin Audit Trail System
-- Addresses the evaluation criteria requirement for handling refunds and reversed transactions

-- ================================================================================
-- SCHEMA ENHANCEMENTS FOR REFUNDS AND REVERSALS
-- ================================================================================

-- Add columns to support refunds and reversals
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS refund_of_transaction_id INTEGER;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_refund BOOLEAN DEFAULT FALSE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversal_of_transaction_id INTEGER;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS is_reversal BOOLEAN DEFAULT FALSE;
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS reversal_reason TEXT;

-- Add foreign key constraints for data integrity
ALTER TABLE public.transactions 
ADD CONSTRAINT fk_refund_original 
FOREIGN KEY (refund_of_transaction_id) 
REFERENCES public.transactions(transactionid);

ALTER TABLE public.transactions 
ADD CONSTRAINT fk_reversal_original 
FOREIGN KEY (reversal_of_transaction_id) 
REFERENCES public.transactions(transactionid);

-- Add indexes for refund and reversal lookups
CREATE INDEX IF NOT EXISTS idx_transactions_refunds 
ON public.transactions(refund_of_transaction_id) WHERE is_refund = TRUE;

CREATE INDEX IF NOT EXISTS idx_transactions_reversals 
ON public.transactions(reversal_of_transaction_id) WHERE is_reversal = TRUE;

-- ================================================================================
-- SAMPLE DATA: REFUNDS AND REVERSALS
-- ================================================================================

-- Example refund scenario: User 3 refunds part of their deposit
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
    receiverid,
    is_refund,
    refund_of_transaction_id
) VALUES (
    10008, 
    'refund', 
    3, 
    '2024-01-10 14:00:00', 
    'successful', 
    50000.00, 
    50000.00, 
    'NGN', 
    'NGN', 
    3, 
    3,
    TRUE,
    3  -- Refunding transaction ID 3 (the original transfer from User 1)
);

-- Example reversal scenario: Reverse a failed transfer that was incorrectly processed
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
    receiverid,
    is_reversal,
    reversal_of_transaction_id,
    reversal_reason
) VALUES (
    10009, 
    'reversal', 
    1, 
    '2024-01-11 09:30:00', 
    'successful', 
    100.00, 
    100.00, 
    'USD', 
    'USD', 
    1, 
    1,
    TRUE,
    6,  -- Reversing transaction ID 6 (the withdrawal)
    'Incorrect withdrawal amount - customer dispute resolved'
);

-- ================================================================================
-- VERIFICATION QUERIES
-- ================================================================================

-- Check refunds and reversals
SELECT 
    'Refunds and Reversals Summary' as summary_type,
    COUNT(CASE WHEN is_refund = TRUE THEN 1 END) as total_refunds,
    COUNT(CASE WHEN is_reversal = TRUE THEN 1 END) as total_reversals,
    COUNT(*) as total_transactions
FROM transactions;

-- Show refund chain
SELECT 
    t1.transactionid as original_transaction,
    t1.transactiontype as original_type,
    t1.senderamount as original_amount,
    t1.fulltimestamp as original_time,
    t2.transactionid as refund_transaction,
    t2.senderamount as refund_amount,
    t2.fulltimestamp as refund_time
FROM transactions t1
JOIN transactions t2 ON t1.transactionid = t2.refund_of_transaction_id
WHERE t2.is_refund = TRUE;

-- Show reversal chain
SELECT 
    t1.transactionid as original_transaction,
    t1.transactiontype as original_type,
    t1.status as original_status,
    t1.fulltimestamp as original_time,
    t2.transactionid as reversal_transaction,
    t2.reversal_reason,
    t2.fulltimestamp as reversal_time
FROM transactions t1
JOIN transactions t2 ON t1.transactionid = t2.reversal_of_transaction_id
WHERE t2.is_reversal = TRUE;