# HoneyCoin Audit Trail System

A sophisticated financial transaction audit system built with PostgreSQL and Express.js, designed to track fund legitimacy and provide comprehensive transaction analysis for multi-currency financial applications.

## 🏗️ System Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Express API   │────│  Audit Service  │────│   PostgreSQL    │
│   (REST Layer)  │    │  (Business      │    │   (Advanced     │
│                 │    │   Logic)        │    │    Queries)     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         │              ┌─────────────────┐              │
         └──────────────│  Rate Limiting  │──────────────┘
                        │   & Security    │
                        └─────────────────┘
```

## 🌟 Key Features

### Advanced SQL Capabilities
- **Recursive Fund Tracing**: Uses PostgreSQL CTEs to track money through complex transfer chains
- **Multi-Currency Support**: Automatic currency conversion with configurable exchange rates
- **Performance Optimized**: Strategic indexing for large-scale financial datasets
- **Balance Reconciliation**: Validates stored balances against calculated transaction history

### Comprehensive Audit Trail
- **Transaction History**: Complete chronological record with running balances
- **Fund Legitimacy Analysis**: Traces incoming funds back to original deposits
- **Risk Assessment**: Automated recommendations based on transaction patterns
- **Circular Transfer Detection**: Prevents infinite loops in fund tracing

### Production-Ready API
- **RESTful Design**: Clean, intuitive endpoints following industry standards
- **Security Hardened**: Helmet.js, CORS, rate limiting, input validation
- **Error Handling**: Comprehensive error responses with actionable messages
- **Monitoring Ready**: Request logging and health checks

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- PostgreSQL 12+
- npm or yarn

### Installation

```bash
# Clone and setup
git clone <repository>
cd honeycoin-challenge
npm install

# Database setup
cp .env.example .env
# Edit .env with your database credentials

# Initialize database
psql -d your_database -f database-setup.sql

# Start development server
npm run dev
```

### Configuration

```bash
# .env file
DB_HOST=localhost
DB_PORT=5432
DB_NAME=honeycoin
DB_USER=postgres
DB_PASSWORD=your_password
PORT=3000
NODE_ENV=development
```

## 📊 API Reference

### Base URL
```
http://localhost:3000
```

### Endpoints

#### `GET /api/audit/:userId`
Returns comprehensive audit trail for a user.

**Response:**
```json
{
  "success": true,
  "data": {
    "userId": 1,
    "auditTimestamp": "2024-01-15T10:30:00Z",
    "summary": {
      "baseCurrency": "USD",
      "currentBalance": 950.00,
      "calculatedBalance": 950.00,
      "balanceStatus": "BALANCED"
    },
    "metrics": {
      "totalTransactions": 6,
      "fundLegitimacy": {
        "legitimacyScore": 85
      }
    },
    "transactionHistory": [...],
    "fundLegitimacyTrail": [...],
    "recommendations": [...]
  }
}
```

#### `GET /api/balance/:userId`
Returns user balance summary.

#### `GET /api/health`
Health check endpoint.

## 🔍 Technical Deep Dive

### Database Schema Optimizations

```sql
-- Strategic indexes for performance
CREATE INDEX idx_transactions_userid ON transactions(userid);
CREATE INDEX idx_transactions_timestamp ON transactions(fulltimestamp);
CREATE INDEX idx_currency_conversion ON currencyconversions(fromcurrency, tocurrency);
```

### Advanced SQL Features

#### 1. Multi-Currency Balance Calculation
```sql
WITH transaction_impacts AS (
  SELECT 
    CASE 
      WHEN transactiontype = 'deposit' THEN 
        receiveramount * COALESCE(cc.conversionrate, 1.0)
      WHEN transactiontype = 'withdrawal' THEN 
        -senderamount * COALESCE(cc.conversionrate, 1.0)
      -- ... transfer logic
    END as balance_impact_base_currency
  FROM transactions t
  LEFT JOIN currencyconversions cc ON ...
)
```

#### 2. Recursive Fund Legitimacy Tracing
```sql
WITH RECURSIVE fund_trail AS (
  -- Base case: incoming transfers
  SELECT t.*, 1 as trail_depth, false as is_original_source
  FROM transactions t
  WHERE receiverid = $1 AND transactiontype = 'transfer'
  
  UNION ALL
  
  -- Recursive case: follow the chain backwards
  SELECT t.*, ft.trail_depth + 1,
    CASE WHEN t.transactiontype = 'deposit' THEN true ELSE false END
  FROM fund_trail ft
  JOIN transactions t ON t.receiverid = ft.senderid
  WHERE ft.trail_depth < 10 -- Prevent infinite loops
)
```

### Business Logic Highlights

#### Fund Legitimacy Scoring
- **LEGITIMATE_DEPOSIT**: Funds traceable to original deposits (100% score)
- **TRACEABLE_TO_DEPOSIT**: Indirect traceability through valid chains (80% score)
- **UNVERIFIED_SOURCE**: Cannot trace to legitimate source (0% score)
- **MAX_DEPTH_REACHED**: Trace depth limit exceeded (requires investigation)

#### Risk Assessment
```javascript
generateRecommendations(summary, metrics) {
  const recommendations = [];
  
  // Balance discrepancy detection
  if (summary.balanceStatus === 'DISCREPANCY') {
    recommendations.push({
      type: 'CRITICAL',
      message: 'Balance discrepancy detected',
      action: 'Review all transactions for potential errors'
    });
  }
  
  // Fund legitimacy assessment
  if (metrics.fundLegitimacy.legitimacyScore < 80) {
    recommendations.push({
      type: 'WARNING',
      message: 'Low fund legitimacy score',
      action: 'Investigate unverified fund sources'
    });
  }
}
```

## 🛡️ Security Considerations

### Input Validation
- Joi schema validation for all user inputs
- SQL injection prevention through parameterized queries
- Rate limiting to prevent abuse

### Data Protection
- No sensitive data in logs
- Helmet.js security headers
- CORS configuration for production

### Audit Trail Integrity
- Immutable transaction history
- Cryptographic hash validation (future enhancement)
- Comprehensive logging

## 📈 Performance Optimizations

### Database Level
- Strategic indexing on frequently queried columns
- Connection pooling with configurable limits
- Query timeout handling

### Application Level
- Parallel database queries where possible
- Response caching opportunities identified
- Memory-efficient result processing

### Monitoring
- Query execution time logging
- Database connection health checks
- API response time tracking

## 🧪 Testing

```bash
# Run tests
npm test

# Run with coverage
npm run test:coverage

# Run linting
npm run lint
```

## 🔧 Advanced Configuration

### Currency Conversion
The system supports real-time currency conversion through the `currencyconversions` table. For production deployments, consider:

- External exchange rate APIs integration
- Historical rate storage for accurate point-in-time calculations
- Fallback mechanisms for missing conversion rates

### Scaling Considerations
- Database read replicas for audit queries
- Redis caching for frequently accessed user data
- Horizontal API scaling with load balancers

## 📋 Key Assumptions

1. **Currency Conversion**: Uses static rates from `currencyconversions` table; falls back to 1:1 if rate missing
2. **Transaction Status**: Only processes `successful` transactions
3. **Fund Legitimacy**: Original deposits are considered legitimate sources
4. **Trace Depth**: Limited to 10 levels to prevent infinite recursion
5. **Balance Reconciliation**: Compares stored vs. calculated balances within 0.01 tolerance

## 🚀 Production Deployment

### Environment Setup
```bash
# Production environment variables
NODE_ENV=production
DB_HOST=your-prod-db-host
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=1000
```

### Docker Support (Future Enhancement)
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

## 🎯 Future Enhancements

1. **Real-time Monitoring**: Prometheus/Grafana integration
2. **Blockchain Integration**: Immutable audit trail storage
3. **Machine Learning**: Anomaly detection for suspicious patterns
4. **Compliance Features**: AML/KYC integration hooks
5. **Data Export**: PDF/Excel report generation
6. **Webhook Support**: Real-time audit notifications

## 🤝 Contributing

This system demonstrates enterprise-level financial software engineering practices suitable for production fintech applications.

---

**Built with ❤️ for HoneyCoin Engineering Challenge**