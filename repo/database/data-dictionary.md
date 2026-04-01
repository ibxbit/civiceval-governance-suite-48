# App Schema Data Dictionary

Schema: `app`

This dictionary maps each table and field to its business meaning, PostgreSQL type, and validation constraints defined in `database/sql/*.sql`.

## app.users

| Field         | Type        | Business Definition                                              | Validation / Rules                                            |
| ------------- | ----------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| id            | BIGSERIAL   | Internal unique user id.                                         | Primary key.                                                  |
| username      | VARCHAR(32) | Login identifier displayed to admins/operators.                  | `NOT NULL`, `UNIQUE`.                                         |
| password_hash | TEXT        | One-way password hash for authentication.                        | `NOT NULL`.                                                   |
| role          | VARCHAR(32) | RBAC role (`admin`, `program_owner`, `reviewer`, `participant`). | `NOT NULL`, default `participant`, `CHECK` allowed role list. |
| created_at    | TIMESTAMPTZ | Record creation time.                                            | `NOT NULL`, default `NOW()`.                                  |
| updated_at    | TIMESTAMPTZ | Last profile/role update time.                                   | `NOT NULL`, default `NOW()`.                                  |

## app.sessions

| Field            | Type        | Business Definition                                | Validation / Rules                                   |
| ---------------- | ----------- | -------------------------------------------------- | ---------------------------------------------------- |
| id               | BIGSERIAL   | Session record id for active/revoked JWT sessions. | Primary key.                                         |
| user_id          | BIGINT      | User owning the session.                           | `NOT NULL`, FK `app.users(id)`, `ON DELETE CASCADE`. |
| token_id         | UUID        | Unique token fingerprint for revocation checks.    | `NOT NULL`, `UNIQUE`.                                |
| last_activity_at | TIMESTAMPTZ | Last authenticated API activity.                   | `NOT NULL`, default `NOW()`.                         |
| expires_at       | TIMESTAMPTZ | Session expiry time.                               | `NOT NULL`.                                          |
| revoked_at       | TIMESTAMPTZ | Revocation timestamp for logout/security events.   | Nullable.                                            |
| created_at       | TIMESTAMPTZ | Session creation time.                             | `NOT NULL`, default `NOW()`.                         |

## app.login_attempts

| Field           | Type        | Business Definition                                | Validation / Rules           |
| --------------- | ----------- | -------------------------------------------------- | ---------------------------- |
| username        | VARCHAR(32) | Username key for brute-force tracking.             | Primary key.                 |
| failed_count    | INTEGER     | Number of consecutive failed logins.               | `NOT NULL`, default `0`.     |
| first_failed_at | TIMESTAMPTZ | First failure timestamp in current failure window. | `NOT NULL`, default `NOW()`. |
| last_failed_at  | TIMESTAMPTZ | Most recent failure timestamp.                     | `NOT NULL`, default `NOW()`. |
| locked_until    | TIMESTAMPTZ | Temporary lockout expiry.                          | Nullable.                    |

## app.login_devices

| Field              | Type        | Business Definition                                       | Validation / Rules                                   |
| ------------------ | ----------- | --------------------------------------------------------- | ---------------------------------------------------- |
| id                 | BIGSERIAL   | Device record id.                                         | Primary key.                                         |
| user_id            | BIGINT      | User associated to device fingerprint.                    | `NOT NULL`, FK `app.users(id)`, `ON DELETE CASCADE`. |
| device_fingerprint | CHAR(64)    | Deterministic fingerprint hash of client characteristics. | `NOT NULL`, unique with `user_id`.                   |
| user_agent         | TEXT        | Raw browser/app user agent string.                        | Nullable.                                            |
| ip_address         | VARCHAR(80) | Last observed source IP for device.                       | Nullable.                                            |
| first_seen_at      | TIMESTAMPTZ | First successful login from this fingerprint.             | `NOT NULL`, default `NOW()`.                         |
| last_seen_at       | TIMESTAMPTZ | Most recent successful login from this fingerprint.       | `NOT NULL`, default `NOW()`.                         |

## app.auth_login_events

| Field               | Type        | Business Definition                 | Validation / Rules                                 |
| ------------------- | ----------- | ----------------------------------- | -------------------------------------------------- |
| id                  | BIGSERIAL   | Login event id.                     | Primary key.                                       |
| user_id             | BIGINT      | Linked user when resolvable.        | Nullable FK `app.users(id)`, `ON DELETE SET NULL`. |
| username            | VARCHAR(32) | Username submitted during login.    | `NOT NULL`.                                        |
| success             | BOOLEAN     | Whether authentication succeeded.   | `NOT NULL`.                                        |
| device_fingerprint  | CHAR(64)    | Login fingerprint hash.             | Nullable.                                          |
| user_agent          | TEXT        | Client user agent for audit review. | Nullable.                                          |
| ip_address          | VARCHAR(80) | Source IP.                          | Nullable.                                          |
| is_unrecognized     | BOOLEAN     | Indicates new/unrecognized device.  | `NOT NULL`, default `FALSE`.                       |
| created_at          | TIMESTAMPTZ | Event timestamp.                    | `NOT NULL`, default `NOW()`.                       |
| reviewed_at         | TIMESTAMPTZ | Admin review completion timestamp.  | Added by `09_auth_login_reviews.sql`, nullable.    |
| reviewed_by_user_id | BIGINT      | Admin reviewer id.                  | Nullable FK `app.users(id)`, `ON DELETE SET NULL`. |
| review_note         | TEXT        | Optional admin review note.         | Nullable.                                          |

## app.activities

| Field                 | Type         | Business Definition                         | Validation / Rules                                               |
| --------------------- | ------------ | ------------------------------------------- | ---------------------------------------------------------------- |
| id                    | BIGSERIAL    | Activity id.                                | Primary key.                                                     |
| title                 | VARCHAR(200) | Activity name shown to participants.        | `NOT NULL`.                                                      |
| description           | TEXT         | Activity details and instructions.          | Nullable.                                                        |
| participation_type    | VARCHAR(16)  | Registration mode (`individual` or `team`). | `NOT NULL`, `CHECK` in enum set.                                 |
| starts_at             | TIMESTAMPTZ  | Activity start timestamp.                   | `NOT NULL`, `CHECK starts_at < ends_at`.                         |
| ends_at               | TIMESTAMPTZ  | Activity end timestamp.                     | `NOT NULL`, `CHECK starts_at < ends_at`.                         |
| registration_start_at | TIMESTAMPTZ  | Registration open timestamp.                | `NOT NULL`, `CHECK registration_start_at < registration_end_at`. |
| registration_end_at   | TIMESTAMPTZ  | Registration close timestamp.               | `NOT NULL`, `CHECK registration_end_at <= starts_at`.            |
| created_by_user_id    | BIGINT       | Program owner/admin creator.                | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`.            |
| created_at            | TIMESTAMPTZ  | Row creation time.                          | `NOT NULL`, default `NOW()`.                                     |
| updated_at            | TIMESTAMPTZ  | Last update time.                           | `NOT NULL`, default `NOW()`.                                     |
| deleted_at            | TIMESTAMPTZ  | Soft-delete marker.                         | Nullable.                                                        |

## app.activity_registrations

| Field        | Type        | Business Definition             | Validation / Rules                                        |
| ------------ | ----------- | ------------------------------- | --------------------------------------------------------- |
| id           | BIGSERIAL   | Registration id.                | Primary key.                                              |
| activity_id  | BIGINT      | Target activity.                | `NOT NULL`, FK `app.activities(id)`, `ON DELETE CASCADE`. |
| user_id      | BIGINT      | Registered participant.         | `NOT NULL`, FK `app.users(id)`, `ON DELETE CASCADE`.      |
| created_at   | TIMESTAMPTZ | Registration creation time.     | `NOT NULL`, default `NOW()`.                              |
| updated_at   | TIMESTAMPTZ | Last registration state update. | `NOT NULL`, default `NOW()`.                              |
| cancelled_at | TIMESTAMPTZ | Soft-cancel marker.             | Nullable.                                                 |

## app.activity_checkin_codes

| Field              | Type        | Business Definition            | Validation / Rules                                        |
| ------------------ | ----------- | ------------------------------ | --------------------------------------------------------- |
| id                 | BIGSERIAL   | One-time check-in code id.     | Primary key.                                              |
| activity_id        | BIGINT      | Activity tied to this code.    | `NOT NULL`, FK `app.activities(id)`, `ON DELETE CASCADE`. |
| code_hash          | CHAR(64)    | SHA-256 hash of one-time code. | `NOT NULL`.                                               |
| created_by_user_id | BIGINT      | User who generated code.       | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`.     |
| used_by_user_id    | BIGINT      | Participant who consumed code. | Nullable FK `app.users(id)`, `ON DELETE SET NULL`.        |
| expires_at         | TIMESTAMPTZ | Code expiration timestamp.     | `NOT NULL`.                                               |
| used_at            | TIMESTAMPTZ | First consumption timestamp.   | Nullable.                                                 |
| revoked_at         | TIMESTAMPTZ | Manual revocation timestamp.   | Nullable.                                                 |
| created_at         | TIMESTAMPTZ | Code creation timestamp.       | `NOT NULL`, default `NOW()`.                              |

## app.activity_checkins

| Field           | Type        | Business Definition       | Validation / Rules                                                     |
| --------------- | ----------- | ------------------------- | ---------------------------------------------------------------------- |
| id              | BIGSERIAL   | Check-in id.              | Primary key.                                                           |
| activity_id     | BIGINT      | Checked-in activity.      | `NOT NULL`, FK `app.activities(id)`, `ON DELETE CASCADE`.              |
| user_id         | BIGINT      | Checked-in participant.   | `NOT NULL`, FK `app.users(id)`, `ON DELETE CASCADE`.                   |
| checkin_code_id | BIGINT      | Code used for check-in.   | `NOT NULL`, FK `app.activity_checkin_codes(id)`, `ON DELETE RESTRICT`. |
| checked_in_at   | TIMESTAMPTZ | Check-in completion time. | `NOT NULL`, default `NOW()`.                                           |

## app.cms_files

| Field               | Type         | Business Definition                        | Validation / Rules                                    |
| ------------------- | ------------ | ------------------------------------------ | ----------------------------------------------------- |
| id                  | BIGSERIAL    | File id for CMS attachments.               | Primary key.                                          |
| original_name       | VARCHAR(255) | Original uploaded filename.                | `NOT NULL`.                                           |
| mime_type           | VARCHAR(100) | MIME type used for serving and validation. | `NOT NULL`.                                           |
| extension           | VARCHAR(20)  | File extension as persisted metadata.      | `NOT NULL`, default `''`.                             |
| size_bytes          | BIGINT       | File size in bytes.                        | `NOT NULL`, `CHECK size_bytes >= 0 AND <= 262144000`. |
| sha256_hash         | CHAR(64)     | SHA-256 hash for integrity and dedupe.     | `NOT NULL`, unique with `size_bytes`.                 |
| storage_path        | TEXT         | Relative private storage path on disk.     | `NOT NULL`, `UNIQUE`.                                 |
| uploaded_by_user_id | BIGINT       | Uploading user id.                         | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`. |
| created_at          | TIMESTAMPTZ  | Upload timestamp.                          | `NOT NULL`, default `NOW()`.                          |

## app.cms_content

| Field              | Type         | Business Definition                          | Validation / Rules                                    |
| ------------------ | ------------ | -------------------------------------------- | ----------------------------------------------------- |
| id                 | BIGSERIAL    | Content item id.                             | Primary key.                                          |
| title              | VARCHAR(200) | Content title.                               | `NOT NULL`.                                           |
| rich_text          | TEXT         | Body/content markup text.                    | `NOT NULL`.                                           |
| status             | VARCHAR(16)  | Workflow state (`draft`, `published`).       | `NOT NULL`, `CHECK` enum.                             |
| file_ids           | BIGINT[]     | Attached file ids snapshot.                  | `NOT NULL`, default empty array.                      |
| version_number     | INTEGER      | Current version number.                      | `NOT NULL`, default `1`, `CHECK version_number > 0`.  |
| created_by_user_id | BIGINT       | Creator user id.                             | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`. |
| updated_by_user_id | BIGINT       | Last editor user id.                         | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`. |
| published_at       | TIMESTAMPTZ  | Publish timestamp when state is `published`. | Nullable.                                             |
| archived_at        | TIMESTAMPTZ  | Soft-archive marker.                         | Nullable.                                             |
| created_at         | TIMESTAMPTZ  | Creation timestamp.                          | `NOT NULL`, default `NOW()`.                          |
| updated_at         | TIMESTAMPTZ  | Last update timestamp.                       | `NOT NULL`, default `NOW()`.                          |

## app.cms_content_versions

| Field              | Type         | Business Definition                                         | Validation / Rules                                         |
| ------------------ | ------------ | ----------------------------------------------------------- | ---------------------------------------------------------- |
| id                 | BIGSERIAL    | Version row id.                                             | Primary key.                                               |
| content_id         | BIGINT       | Parent content id.                                          | `NOT NULL`, FK `app.cms_content(id)`, `ON DELETE CASCADE`. |
| version_number     | INTEGER      | Historical version sequence number.                         | `NOT NULL`, unique with `content_id`.                      |
| title              | VARCHAR(200) | Versioned title snapshot.                                   | `NOT NULL`.                                                |
| rich_text          | TEXT         | Versioned content snapshot.                                 | `NOT NULL`.                                                |
| status             | VARCHAR(16)  | Versioned workflow state.                                   | `NOT NULL`, `CHECK` in (`draft`, `published`).             |
| file_ids           | BIGINT[]     | Versioned attachment ids.                                   | `NOT NULL`, default empty array.                           |
| action             | VARCHAR(16)  | Version origin (`create`, `update`, `publish`, `rollback`). | `NOT NULL`, `CHECK` enum.                                  |
| created_by_user_id | BIGINT       | User causing version creation.                              | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`.      |
| created_at         | TIMESTAMPTZ  | Version creation timestamp.                                 | `NOT NULL`, default `NOW()`.                               |

## app.evaluation_forms

| Field              | Type          | Business Definition                    | Validation / Rules                                      |
| ------------------ | ------------- | -------------------------------------- | ------------------------------------------------------- |
| id                 | BIGSERIAL     | Evaluation form id.                    | Primary key.                                            |
| activity_id        | BIGINT        | Optional linked activity.              | Nullable FK `app.activities(id)`, `ON DELETE SET NULL`. |
| title              | VARCHAR(200)  | Form title.                            | `NOT NULL`.                                             |
| description        | VARCHAR(1000) | Form description.                      | Nullable.                                               |
| is_active          | BOOLEAN       | Availability flag for new submissions. | `NOT NULL`, default `TRUE`.                             |
| created_by_user_id | BIGINT        | Creator (owner/admin).                 | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`.   |
| created_at         | TIMESTAMPTZ   | Form creation timestamp.               | `NOT NULL`, default `NOW()`.                            |

## app.evaluation_questions

| Field         | Type         | Business Definition                                | Validation / Rules                                              |
| ------------- | ------------ | -------------------------------------------------- | --------------------------------------------------------------- |
| id            | BIGSERIAL    | Question id.                                       | Primary key.                                                    |
| form_id       | BIGINT       | Parent form id.                                    | `NOT NULL`, FK `app.evaluation_forms(id)`, `ON DELETE CASCADE`. |
| prompt        | VARCHAR(300) | Question prompt shown to user.                     | `NOT NULL`.                                                     |
| response_type | VARCHAR(32)  | Expected answer type (`numeric_scale`, `comment`). | `NOT NULL`, `CHECK` enum.                                       |
| is_required   | BOOLEAN      | Mandatory answer flag.                             | `NOT NULL`, default `FALSE`.                                    |
| order_index   | INTEGER      | Display order in form.                             | `NOT NULL`, `CHECK order_index > 0`, unique with `form_id`.     |
| min_value     | SMALLINT     | Numeric lower bound for numeric scale questions.   | `CHECK` with `response_type`.                                   |
| max_value     | SMALLINT     | Numeric upper bound for numeric scale questions.   | `CHECK` with `response_type`.                                   |
| created_at    | TIMESTAMPTZ  | Question creation timestamp.                       | `NOT NULL`, default `NOW()`.                                    |

## app.evaluation_submissions

| Field                | Type        | Business Definition                               | Validation / Rules                                               |
| -------------------- | ----------- | ------------------------------------------------- | ---------------------------------------------------------------- |
| id                   | BIGSERIAL   | Submission id.                                    | Primary key.                                                     |
| form_id              | BIGINT      | Target form.                                      | `NOT NULL`, FK `app.evaluation_forms(id)`, `ON DELETE RESTRICT`. |
| submitted_by_user_id | BIGINT      | Submitting participant.                           | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`.            |
| receipt_id           | VARCHAR(64) | Immutable receipt shown to participant for proof. | `NOT NULL`, `UNIQUE`.                                            |
| answers              | JSONB       | Serialized response payload.                      | `NOT NULL`.                                                      |
| submitted_at         | TIMESTAMPTZ | Submission timestamp.                             | `NOT NULL`, default `NOW()`.                                     |

## app.analytics_events

| Field       | Type         | Business Definition                                                           | Validation / Rules                                          |
| ----------- | ------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------- |
| id          | BIGSERIAL    | Analytics event id.                                                           | Primary key.                                                |
| event_type  | VARCHAR(16)  | Event kind (`page_view`, `dwell`, `read_complete`, `search`, `search_click`). | `NOT NULL`, `CHECK` enum.                                   |
| page_path   | VARCHAR(500) | UI route/page path.                                                           | `NOT NULL`.                                                 |
| user_id     | BIGINT       | Event actor user id.                                                          | `NOT NULL`, FK `app.users(id)`, `ON DELETE CASCADE`.        |
| content_id  | BIGINT       | Related content id when relevant.                                             | Nullable.                                                   |
| referrer    | VARCHAR(500) | Referrer/source string.                                                       | Nullable.                                                   |
| dwell_ms    | INTEGER      | Dwell duration in milliseconds for `dwell` events only.                       | Conditional `CHECK` by `event_type`, non-negative when set. |
| occurred_at | TIMESTAMPTZ  | Event occurrence time from client/server context.                             | `NOT NULL`, default `NOW()`.                                |
| created_at  | TIMESTAMPTZ  | Insertion timestamp.                                                          | `NOT NULL`, default `NOW()`.                                |

## app.comments

| Field                | Type         | Business Definition                                   | Validation / Rules                                    |
| -------------------- | ------------ | ----------------------------------------------------- | ----------------------------------------------------- |
| id                   | BIGSERIAL    | Comment id.                                           | Primary key.                                          |
| content_id           | BIGINT       | Related content id (if any).                          | Nullable.                                             |
| body                 | TEXT         | Comment text payload.                                 | `NOT NULL`.                                           |
| status               | VARCHAR(16)  | Moderation status (`pending`, `approved`, `blocked`). | `NOT NULL`, `CHECK` enum.                             |
| pinned               | BOOLEAN      | Pinning flag for prioritization.                      | `NOT NULL`, default `FALSE`.                          |
| created_by_user_id   | BIGINT       | Comment author id.                                    | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`. |
| moderated_by_user_id | BIGINT       | Moderator user id for last moderation action.         | Nullable FK `app.users(id)`, `ON DELETE SET NULL`.    |
| moderation_note      | VARCHAR(500) | Moderator note.                                       | Nullable.                                             |
| moderated_at         | TIMESTAMPTZ  | Last moderation timestamp.                            | Nullable.                                             |
| created_at           | TIMESTAMPTZ  | Comment creation time.                                | `NOT NULL`, default `NOW()`.                          |
| updated_at           | TIMESTAMPTZ  | Last update/moderation time.                          | `NOT NULL`, default `NOW()`.                          |

## app.comment_reports

| Field              | Type          | Business Definition                                 | Validation / Rules                                      |
| ------------------ | ------------- | --------------------------------------------------- | ------------------------------------------------------- |
| id                 | BIGSERIAL     | Report id.                                          | Primary key.                                            |
| comment_id         | BIGINT        | Reported comment id.                                | `NOT NULL`, FK `app.comments(id)`, `ON DELETE CASCADE`. |
| reason             | VARCHAR(300)  | Report reason category/text.                        | `NOT NULL`.                                             |
| details            | VARCHAR(1000) | Additional reporter context.                        | Nullable.                                               |
| status             | VARCHAR(16)   | Resolution state (`open`, `resolved`, `dismissed`). | `NOT NULL`, `CHECK` enum.                               |
| handled_by_user_id | BIGINT        | Reviewer/admin handling the report.                 | Nullable FK `app.users(id)`, `ON DELETE SET NULL`.      |
| handled_at         | TIMESTAMPTZ   | Handling timestamp.                                 | Nullable.                                               |
| resolution_note    | VARCHAR(500)  | Resolution note from moderator.                     | Nullable.                                               |
| created_by_user_id | BIGINT        | Reporting user id.                                  | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`.   |
| created_at         | TIMESTAMPTZ   | Report creation time.                               | `NOT NULL`, default `NOW()`.                            |

## app.rankings

| Field              | Type         | Business Definition              | Validation / Rules                                    |
| ------------------ | ------------ | -------------------------------- | ----------------------------------------------------- |
| id                 | BIGSERIAL    | Ranking record id.               | Primary key.                                          |
| subject_key        | VARCHAR(120) | Ranked subject identifier.       | `NOT NULL`.                                           |
| benchmark_value    | NUMERIC(6,3) | Benchmark metric value (0-100).  | `NOT NULL`, `CHECK` 0-100.                            |
| price_value        | NUMERIC(6,3) | Price metric value (0-100).      | `NOT NULL`, `CHECK` 0-100.                            |
| volatility_value   | NUMERIC(6,3) | Volatility metric value (0-100). | `NOT NULL`, `CHECK` 0-100.                            |
| benchmark_weight   | NUMERIC(6,3) | Benchmark weight percentage.     | `NOT NULL`, `CHECK` 0-100.                            |
| price_weight       | NUMERIC(6,3) | Price weight percentage.         | `NOT NULL`, `CHECK` 0-100.                            |
| volatility_weight  | NUMERIC(6,3) | Volatility weight percentage.    | `NOT NULL`, `CHECK` 0-100.                            |
| score              | NUMERIC(6,3) | Computed weighted score.         | `NOT NULL`, table `CHECK` total weights = 100.        |
| created_by_user_id | BIGINT       | User that generated ranking.     | `NOT NULL`, FK `app.users(id)`, `ON DELETE RESTRICT`. |
| created_at         | TIMESTAMPTZ  | Ranking creation timestamp.      | `NOT NULL`, default `NOW()`.                          |

## app.audit_logs

| Field       | Type         | Business Definition                                          | Validation / Rules                 |
| ----------- | ------------ | ------------------------------------------------------------ | ---------------------------------- |
| id          | BIGSERIAL    | Audit event id.                                              | Primary key.                       |
| user_id     | BIGINT       | Actor user id when available.                                | Nullable.                          |
| action      | VARCHAR(120) | Action code (`auth.login.success`, `content.publish`, etc.). | `NOT NULL`.                        |
| entity_type | VARCHAR(80)  | Domain entity category touched by action.                    | `NOT NULL`.                        |
| entity_id   | BIGINT       | Domain entity id.                                            | Nullable.                          |
| details     | JSONB        | Structured contextual metadata for forensic traceability.    | `NOT NULL`, default `'{}'::jsonb`. |
| ip_address  | VARCHAR(80)  | Source IP for action.                                        | Nullable.                          |
| created_at  | TIMESTAMPTZ  | Audit event timestamp.                                       | `NOT NULL`, default `NOW()`.       |
