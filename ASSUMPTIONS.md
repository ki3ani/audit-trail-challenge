# Technical Assumptions and Design Decisions

## Database and Schema Assumptions

### Currency Conversion Strategy
- **Static Exchange Rates**: The system uses conversion rates from the `currencyconversions` table
- **Missing Rate Fallback**: When conversion rate is unavailable, assumes 1:1 conversion (documented limitation)
- **Base Currency**: All calculations are normalized to the user's base currency for consistency
- **Rate Application**: Uses the most current rate available (not historical point-in-time rates)

### Transaction Processing
- **Status Filtering**: Only processes transactions with `status = 'successful'`
- **Failed Transactions**: Ignored in balance calculations and audit trails
- **Pending Transactions**: Excluded from current implementation (could be added as enhancement)
- **Transaction Ordering**: Chronological processing based on `fulltimestamp` field

## Fund Legitimacy Framework

### Legitimacy Classification
1. **LEGITIMATE_DEPOSIT**: Direct deposits are considered the ultimate legitimate source
2. **TRACEABLE_TO_DEPOSIT**: Funds that can be traced back to deposits through transfer chains
3. **UNVERIFIED_SOURCE**: Funds that cannot be traced to legitimate sources within trace limits
4. **MAX_DEPTH_REACHED**: Trace exceeded 10-level limit (requires manual investigation)

### Trace Depth Limitations
- **Maximum Depth**: Limited to 10 levels to prevent infinite recursion
- **Circular Reference Protection**: Prevents following circular transfer patterns
- **Performance Consideration**: Balances comprehensive tracing with query performance

### Edge Case Handling
- **Circular Transfers**: Detected and prevented using user path tracking
- **Self-Transfers**: Handled appropriately (user sending to themselves)
- **Currency Conversion in Chains**: Maintains amount consistency through conversion rates

## API Design Principles

### Error Handling Strategy
- **Standardized Error Codes**: Consistent error code format across all endpoints
- **Graceful Degradation**: Service remains operational even with partial data issues
- **User-Friendly Messages**: Clear, actionable error messages for debugging

### Security Assumptions
- **Input Validation**: All user inputs validated using Joi schemas
- **SQL Injection Prevention**: Parameterized queries used throughout
- **Rate Limiting**: Applied to prevent abuse and ensure fair usage
- **Authentication**: Not implemented (assumes external authentication layer)

## Performance and Scalability

### Database Performance
- **Indexing Strategy**: Optimized for common query patterns
- **Connection Pooling**: Configured for concurrent request handling
- **Query Optimization**: Uses CTEs and appropriate joins for complex operations

### Caching Strategy
- **No Caching Implemented**: Current version prioritizes data accuracy over speed
- **Future Enhancement**: Redis caching layer identified for user balance data
- **Cache Invalidation**: Would require careful consideration for financial data consistency

## Business Logic Assumptions

### Balance Reconciliation
- **Tolerance Level**: 0.01 units considered acceptable discrepancy due to floating-point precision
- **Discrepancy Handling**: Flagged for investigation but doesn't block operations
- **Source of Truth**: Calculated balance from transactions takes precedence over stored balance

### Risk Assessment
- **Legitimacy Scoring**: Based on percentage of funds traceable to legitimate sources
- **Threshold Levels**: 
  - Above 80%: Acceptable risk
  - Below 80%: Requires investigation
  - 0%: High risk, immediate review needed

### Recommendation Engine
- **Automated Flags**: System automatically identifies potential issues
- **Severity Levels**: CRITICAL, WARNING, INFO for appropriate response prioritization
- **Action Items**: Specific, actionable recommendations for each flag

## Integration Assumptions

### External Dependencies
- **Exchange Rate Service**: Currently uses static data; production would integrate external APIs
- **Authentication Service**: Assumes external authentication/authorization layer
- **Monitoring Systems**: Structured for integration with APM tools (New Relic, DataDog)

### Compliance Framework
- **AML/KYC Integration**: Hooks provided for compliance system integration
- **Audit Logging**: Comprehensive logging for regulatory compliance
- **Data Retention**: Follows financial industry standards for transaction history

## Deployment and Operations

### Environment Configuration
- **Database Connection**: PostgreSQL-specific features utilized
- **Containerization**: Designed for Docker deployment
- **Environment Variables**: All sensitive configuration externalized

### Monitoring and Alerting
- **Health Checks**: Multiple levels of health validation
- **Performance Metrics**: Query execution time and response time tracking
- **Error Tracking**: Comprehensive error logging with context

## Data Quality and Integrity

### Data Validation
- **Referential Integrity**: Foreign key constraints enforced
- **Data Type Validation**: Strict typing for financial amounts
- **Timestamp Consistency**: All times stored in UTC for consistency

### Audit Trail Completeness
- **Immutable History**: Transaction history treated as immutable
- **Comprehensive Tracking**: Every financial movement recorded and traceable
- **Verification Capability**: System can verify its own calculations

## Limitations and Known Issues

### Current Limitations
1. **Historical Exchange Rates**: Uses current rates for all historical calculations
2. **Trace Depth**: 10-level limit may miss complex fund flows
3. **Real-time Updates**: No real-time balance updates (batch processing model)
4. **Multi-tenant**: Single-tenant design (could be extended for multi-tenancy)

### Future Enhancement Areas
1. **Real-time Processing**: Event-driven architecture for immediate updates
2. **Advanced Analytics**: Machine learning for pattern detection
3. **Compliance Integration**: Direct integration with regulatory reporting systems
4. **Blockchain Integration**: Immutable audit trail on distributed ledger

## Testing and Quality Assurance

### Test Coverage Strategy
- **Unit Tests**: Business logic and utility functions
- **Integration Tests**: Database queries and API endpoints
- **Performance Tests**: Load testing for high-volume scenarios
- **Security Tests**: Input validation and injection prevention

### Quality Metrics
- **Code Coverage**: Minimum 80% coverage target
- **Performance Benchmarks**: Sub-100ms response time for simple queries
- **Error Rate**: Less than 0.1% for successful operations

---

These assumptions form the foundation of the audit trail system design and should be reviewed and validated with stakeholders before production deployment.