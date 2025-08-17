-- HoneyCoin Audit Trail System Database Setup
-- PostgreSQL Schema and Sample Data

-- Create database schema
CREATE TABLE IF NOT EXISTS public.users (
    userid integer NOT NULL PRIMARY KEY,
    balance numeric(10,2),
    currency character varying(3)
);

CREATE TABLE IF NOT EXISTS public.transactions (
    transactionid integer NOT NULL PRIMARY KEY,
    transactiontype character varying(10),
    userid integer,
    fulltimestamp timestamp without time zone,
    status character varying(10),
    senderamount numeric(10,2),
    receiveramount numeric(10,2),
    sendercurrency character varying(3),
    receivercurrency character varying(3),
    senderid integer,
    receiverid integer,
    FOREIGN KEY (userid) REFERENCES public.users(userid)
);

CREATE TABLE IF NOT EXISTS public.currencyconversions (
    fromcurrency character varying(3),
    tocurrency character varying(3),
    conversionrate numeric(10,6)
);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_transactions_userid ON public.transactions(userid);
CREATE INDEX IF NOT EXISTS idx_transactions_senderid ON public.transactions(senderid);
CREATE INDEX IF NOT EXISTS idx_transactions_receiverid ON public.transactions(receiverid);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_timestamp ON public.transactions(fulltimestamp);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(transactiontype);
CREATE INDEX IF NOT EXISTS idx_currency_conversion ON public.currencyconversions(fromcurrency, tocurrency);

-- Sample Data for Testing
INSERT INTO public.users (userid, balance, currency) VALUES
(1, 1000.00, 'USD'),
(2, 50000.00, 'KES'),
(3, 200000.00, 'NGN'),
(4, 500.00, 'USD'),
(5, 75000.00, 'KES');

INSERT INTO public.currencyconversions (fromcurrency, tocurrency, conversionrate) VALUES
('USD', 'KES', 150.00),
('KES', 'USD', 0.0067),
('USD', 'NGN', 800.00),
('NGN', 'USD', 0.00125),
('KES', 'NGN', 5.33),
('NGN', 'KES', 0.1875);

INSERT INTO public.transactions (transactionid, transactiontype, userid, fulltimestamp, status, senderamount, receiveramount, sendercurrency, receivercurrency, senderid, receiverid) VALUES
-- User 1 initial deposit
(1, 'deposit', 1, '2024-01-01 10:00:00', 'successful', 1000.00, 1000.00, 'USD', 'USD', 1, 1),
-- User 2 initial deposit
(2, 'deposit', 2, '2024-01-01 11:00:00', 'successful', 50000.00, 50000.00, 'KES', 'KES', 2, 2),
-- User 1 transfers to User 3 (USD to NGN)
(3, 'transfer', 1, '2024-01-02 14:30:00', 'successful', 100.00, 80000.00, 'USD', 'NGN', 1, 3),
-- User 2 transfers to User 1 (KES to USD)
(4, 'transfer', 2, '2024-01-03 09:15:00', 'successful', 15000.00, 100.00, 'KES', 'USD', 2, 1),
-- User 3 transfers back to User 1 (NGN to USD)
(5, 'transfer', 3, '2024-01-04 16:45:00', 'successful', 40000.00, 50.00, 'NGN', 'USD', 3, 1),
-- User 1 withdrawal
(6, 'withdrawal', 1, '2024-01-05 12:00:00', 'successful', 200.00, 200.00, 'USD', 'USD', 1, 1),
-- Failed transaction (should be ignored)
(7, 'transfer', 1, '2024-01-06 10:00:00', 'failed', 500.00, 400000.00, 'USD', 'NGN', 1, 3);