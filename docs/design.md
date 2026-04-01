# CivicEval Governance Portal - Technical Design

## 1. System Architecture
The CivicEval Governance Portal is designed for offline, on-premise deployment.
- **Backend**: Node.js with Fastify (REST API, TLS-enabled).
- **Frontend**: Angular (Desktop-first workspace).
- **Database**: PostgreSQL (System of record).
- **Storage**: Local filesystem for media (Images/Video/PDF).

## 2. Security Design

### Session Management
- **Sliding Window**: Sessions are extended on activity but expire after 30 minutes of inactivity.
- **Revocation**: Centralized session tracking allows immediate revocation on logout or compromise.
- **Account Protection**: Progressive lockout (15 mins) after 5 failed login attempts.

### Anti-Replay & Integrity
- **Nonce/Timestamp**: All state-changing requests require an `x-nonce` and `x-timestamp`.
- **Validation**: Requests are rejected if the timestamp is older than 60 seconds or the nonce has been used.
- **In-Memory Store**: Tracks active nonces with a short TTL for high-performance validation.

### RBAC (Role-Based Access Control)
- **Roles**: `admin`, `program_owner`, `reviewer`, `participant`.
- **Enforcement**: Middleware `roleGuard` validates permissions before route handlers.

## 3. Data Governance & Content Safety

### Audit & Retention
- **Audit Logs**: Critical actions (auth, CMS updates, exports) are logged with metadata.
- **7-Year Retention**: Logs are archived daily to JSONL and stored for compliance.
- **30-Day Backups**: Automated daily rolling backups of DB dumps and CMS assets.

### Content Control
- **Masking**: Sensitive fields (employee IDs, partial hashes) are masked in API responses.
- **Watermarking**: PDFs and images served via the CMS include visible "CONFIDENTIAL" watermarks with user context.
- **Sensitive Scanning**: Content title and body are checked against a rule-based word list before publishing.

## 4. Analytics & Metrics
- **Tracking**: Real-time event recording for user engagement (dwell time, read completion).
- **Reporting**: Composite ranking model with weighted factors (Benchmark, Price, Volatility).
- **Explain-Why**: Logic exposed to break down score contributions for transparency.

## 5. Offline Resiliency
- No external CDN or API dependencies.
- Local storage and backup logic ensure full functionality without internet access.
