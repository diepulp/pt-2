---
title: "Shift Dashboards v0 Alert Thresholds & Baselines"
version: "v0.1"
status: "patch"
last_updated: "2026-01-06"
scope: "Operational alerts for PT-2 Shift Dashboards (v0). Not accounting/AGR/tax."
---

## Purpose

Provide a minimal, v0-safe alerting pack for Shift Dashboards:
- operationally useful
- low-maintenance (no materialized views required)
- avoids accounting drift
- consistent with Loyalty Promo Option C (promo tracked as **issued exposure** + **outstanding (uncleared)** only)

## Baseline method (v0 default)

Use a robust baseline per metric:
- **Window:** last **7 gaming days**
- **Slice:** same **hour-of-day** (or same shift block if you have it)
- **Center:** **median**
- **Dispersion:** **MAD** (or IQR) to reduce outlier sensitivity

Fallback when insufficient history (e.g., <3 gaming days): use the static defaults below.

### Severity levels

- **Info:** FYI / watch
- **Warn:** needs attention soon
- **Critical:** action now

---

## v0 Alert Set

### 1) Table activity alerts

| Alert | Trigger (v0 default) | Severity | Notes |
|---|---:|---|---|
| Table idle while “open” | no drop events **and** no slip activity for **> 20 min** | Warn | Catches “open but dead” / missed status |
| Long idle | idle **> 45 min** | Critical | |
| Drop spike | current hour drop > **baseline + 3×MAD** | Warn | Operational anomaly flag |
| Drop collapse | current hour drop < **baseline − 3×MAD** *(or < 50% of baseline)* | Warn | |

> If “open/closed” status is not reliable yet, only evaluate idle against `table_status = open`.

---

### 2) Hold / win-rate sanity (operational, not accounting)

These are **disabled by default** unless you trust drop+win inputs.

| Alert | Trigger | Severity | Notes |
|---|---:|---|---|
| Hold deviation | hold% deviates **> ±10 percentage points** from baseline | Warn | Requires consistent drop/win inputs |
| Extreme hold | hold% **< -5%** or **> 40%** for an hour | Critical | Usually data issue or extraordinary run |

---

### 3) Rating slip lifecycle alerts

| Alert | Trigger | Severity | Notes |
|---|---:|---|---|
| Slip running too long | open slip duration **> 4 hours** | Warn | Stale sessions |
| Slip very long | open slip duration **> 8 hours** | Critical | “Forgot to close” |
| Pause too long | paused duration **> 30 min** | Warn | |
| Many open slips per table | open slips count > **3** on same table | Warn | Likely workflow misuse |

---

### 4) Data quality alerts

| Alert | Trigger | Severity | Notes |
|---|---:|---|---|
| Missing casino context | events missing casino_id / gaming_day mapping | Critical | Pipeline broken |
| Backdated burst | > **50 events** inserted with timestamps older than **2 hours** within 5 minutes | Warn | Late ingestion / clock drift |
| Duplicate risk | same (table_id, ts bucket, amount) repeated > **3×** | Warn | Retry storms / idempotency gaps |

---

### 5) Promo exposure alerts (Loyalty Option C)

**No “unredeemed.”** Only **Outstanding (Uncleared)**.

| Alert | Trigger | Severity | Notes |
|---|---:|---|---|
| Promo issuance spike | issued face value (last hour) > **baseline + 3×MAD** *(fallback: +100% vs baseline)* | Warn | “Why are we throwing coupons?” |
| High void rate | voided / issued within shift > **5%** | Warn | Process mistakes/abuse |
| Outstanding aging | outstanding (uncleared) older than **24 hours** > **$2,000** **or** > **25 coupons** | Warn | Flags hanging exposure without implying redemption |

---

## “One-pack” defaults to ship (v0)

- Idle open table: **20m warn**, **45m critical**
- Slip duration: **4h warn**, **8h critical**
- Pause duration: **30m warn**
- Drop anomaly: **±3×MAD** (fallback: **±50%** vs baseline)
- Hold deviation: **±10pp** (disabled by default)
- Promo spike: **+3×MAD** (fallback: **+100%** vs baseline)
- Promo void rate: **>5% warn**
- Outstanding aging: **>24h warn** if **>$2k** or **>25 coupons**

---

## Storage / ownership (v0)

Store per-casino thresholds as config in `casino_settings` (CasinoService owns). Dashboards and Loyalty consume.

Recommended single JSON setting key:
- `casino_settings.alert_thresholds` (casino-scoped)

> These thresholds are **presentation/ops** controls, not accounting policy controls (no AGR/tax toggles in v0).
