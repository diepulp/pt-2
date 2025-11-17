# RUN-001 Outbox Worker Playbook (stub)

Status: Draft — anchor for SRM outbox references. Keep lean for quick use.

Purpose: monitor and drain `finance_outbox` / `loyalty_outbox` safely.

Checklist:
- Symptoms: lag > target (OBSERVABILITY_SPEC §5), retry storms, rising attempt_count.
- Verify: pending counts, error logs.
- Pause publishes if possible.
- Drain: `FOR UPDATE SKIP LOCKED` in bounded batches; backoff; dedupe before re-publish.
- Resume: enable workers; watch lag back to baseline.
- Escalate: page if retries exceed threshold; involve platform if Supabase channels fail.
- Rollback: disable cron; keep outbox intact; note affected casino_ids.

References: SRM outbox; OBSERVABILITY_SPEC §5.
