# CivicEval Governance Portal - Business Logic Questions Log

This document records the clarifications and architectural decisions made while interpreting the business requirements for the CivicEval Governance Portal.

---

### 1. On-site Check-in Mechanism
**Question**: The prompt mentioned an "optional on-site check-in mode" with a code displayed on a kiosk. How is this code validated against a specific participant?
**My Understanding**: The kiosk displays a time-limited, activity-specific code. Participants must physically see this code and enter it into their own portal account to prove attendance. It is not a unique code per user, but a shared secret for the physical location.
**Solution**: Implemented a `checkin_codes` table linked to activities. The system validates the entered code against the active activity code and records the check-in timestamp for the specific user.

### 2. Weighted Ranking Calculations
**Question**: The prompt requires a composite scoring model with weights that "must sum to 100%". Is this weight set globally or per user?
**My Understanding**: This is a dynamic analysis tool. Different reviewers or stakeholders might want to prioritize different factors (Benchmark vs. Price vs. Volatility) to see how rankings change.
**Solution**: Implemented the weight validation in both the Frontend (UI feedback) and Backend (Zod schema) to ensure the sum is exactly 1.0 (100%) before performing the composite score calculation.

### 3. Content Versioning and Rollback
**Question**: The CMS requires "version history with rollback." Should every minor edit create a new version?
**My Understanding**: Only "Publish" actions or significant save milestones should trigger a version snapshot to prevent database bloat, while allowing recovery of previously published states.
**Solution**: Implemented a `content_versions` table that captures the state whenever a Program Owner hits "Publish" or explicitly saves a version. The `rollback` endpoint sets the `current_version_id` back to a previous entry.

### 4. Sensitive Word Scanning & Logic
**Question**: The prompt specifies rule-based "sensitive-word list" scanning. Should this block the save or just the publish?
**My Understanding**: To allow for drafting and collaborative editing without constant interruptions, the scan should be enforced as a hard gate at the "Publish" stage.
**Solution**: Added a validation step in the `POST /publish` route that compares the content body against the `sensitive_words` database table. If a match is found, the publish action is rejected with a list of offending words.

### 5. Data Deletion and Audit Integrity
**Question**: Prompt includes instructions for "deleting" activities and content. Does this conflict with the "7-year audit retention" requirement?
**My Understanding**: A hard delete would destroy the audit trail. All "deletions" in a governance-linked system must be logical deletes.
**Solution**: Implemented a `deleted_at` timestamp across all primary tables. Records are filtered from the UI but remain in the database for 7 years to satisfy the audit log and archival requirements.

### 6. Receipt Generation
**Question**: Participants must receive a "confirmation receipt number" after evaluation. What is the format and uniqueness scope?
**My Understanding**: The receipt serves as a proof of participation and must be unique across the entire system.
**Solution**: Implemented a receipt generator that produces a prefixed string (e.g., `EVR-{UUID-PART}`) stored in the `evaluation_submissions` table and returned in the success response.
