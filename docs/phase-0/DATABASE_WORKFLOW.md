# Database Development Workflow

## TL;DR - Use Local DB for Development

**Development**: Local DB (fast, safe, automated)
**Deployment**: Apply to remote when ready (Dashboard)

---

## Daily Development Workflow

### 1. Start Working (First Time / After Git Pull)
```bash
# Reset local DB with latest migrations
npx supabase db reset --local

# Generate types from local
npx supabase gen types typescript --local > types/database.types.ts

# Start dev server
npm run dev
```

### 2. Create New Feature (TDD)
```bash
# Write test
npm run test:watch

# Write migration (if schema change needed)
# Create: supabase/migrations/YYYYMMDDHHMMSS_feature_name.sql

# Apply migration locally
npx supabase db reset --local

# Regenerate types
npx supabase gen types typescript --local > types/database.types.ts

# Test passes
npm test

# Commit
git add .
git commit -m "feat: new feature with migration"
```

### 3. Daily Reset (Clean Slate)
```bash
# Anytime you want fresh DB
npx supabase db reset --local
```

---

## Deployment Workflow

### When Feature is Ready for Production

**Option A: Manual (Current - No CLI Remote)**
```bash
# 1. Apply migration in Supabase Dashboard
# https://supabase.com/dashboard/project/vaicxfihdldgepzryhpd/sql
# Copy/paste migration SQL → Run

# 2. Regenerate types from remote
npm run db:types

# 3. Commit updated types
git add types/database.types.ts
git commit -m "chore: update types from remote DB"

# 4. Deploy app
git push
```

**Option B: Automated (When CLI Remote Works)**
```bash
# 1. Push migration to remote
npx supabase db push

# 2. Regenerate types
npm run db:types

# 3. Deploy
git push
```

---

## Type Generation Strategy

### During Development (Local)
```bash
# Fast iteration, matches local schema
npx supabase gen types typescript --local > types/database.types.ts
```

### Before Deployment (Remote)
```bash
# Ensure types match production
npm run db:types
```

**Rule**: Always regenerate from remote before deploying

---

## Why Local DB for Development?

### ✅ Benefits

1. **Speed**: Migrations apply in seconds vs minutes
   ```bash
   Local:  npx supabase db reset --local     # 2-5 seconds
   Remote: Dashboard copy/paste/run/verify   # 2-5 minutes
   ```

2. **Safety**: Break things without fear
   ```bash
   # Experiment freely
   npx supabase db reset --local  # Instant rollback
   ```

3. **Offline**: Work without internet

4. **CI/CD**: Automated migration testing
   ```yaml
   # .github/workflows/ci.yml
   - run: npx supabase db reset --local
   - run: npm run test:ci
   ```

5. **Team Isolation**: Each dev has their own sandbox

### ❌ Remote-Only Drawbacks

1. **Slow**: Manual dashboard operations
2. **Risky**: Shared DB, no quick rollback
3. **No CI**: Can't automate migration tests
4. **Coordination**: Team conflicts on shared DB

---

## Migration File Workflow

### Creating Migrations

**Local Development**:
```bash
# 1. Create migration file
touch supabase/migrations/$(date +%Y%m%d%H%M%S)_add_feature.sql

# 2. Write SQL
echo "ALTER TABLE player ADD COLUMN tier TEXT;" >> supabase/migrations/*_add_feature.sql

# 3. Apply locally
npx supabase db reset --local

# 4. Test
npm test

# 5. Commit
git add supabase/migrations/
git commit -m "migration: add player tier column"
```

**Production Deployment**:
```bash
# When PR merges to main:
# 1. Apply migration in Dashboard (manual for now)
# 2. npm run db:types
# 3. git commit types/
# 4. Deploy
```

---

## Current State & Alignment

### Local DB (Already Applied ✅)
- RLS enabled on core tables
- JWT helper function
- Compliance policies
- Audit infrastructure

### Remote DB (Needs Migrations)
- Run Phase 1 migrations in Dashboard
- Or keep remote without RLS for now

### Types (Need Decision)
```bash
# Option 1: Use local types during development
npx supabase gen types typescript --local > types/database.types.ts
git commit  # Commit local types

# Option 2: Use remote types
npm run db:types
git commit  # Commit remote types

# Recommendation: Use local during dev, remote before deploy
```

---

## Recommended Next Steps

### For Phase 2 Development

**1. Commit current state (local types)**:
```bash
# Generate from local (matches your local DB)
npx supabase gen types typescript --local > types/database.types.ts

git add -A
git commit -m "Phase 0: CI/CD, testing, security (local DB)"
```

**2. Develop against local**:
```bash
# Daily workflow
npx supabase db reset --local
npm run dev
npm run test:watch
```

**3. Apply to remote when ready**:
```bash
# When feature complete, manually apply to remote
# Dashboard → SQL Editor → Run migrations
npm run db:types  # Regenerate from remote
git commit types/database.types.ts
```

---

## Team Workflow

### New Team Member Setup
```bash
git clone repo
npm install
npx supabase start          # Start local Supabase
npx supabase db reset --local  # Apply all migrations
npx supabase gen types typescript --local > types/database.types.ts
npm run dev
```

### After Pulling Updates
```bash
git pull
npx supabase db reset --local  # Re-apply migrations
npx supabase gen types typescript --local > types/database.types.ts
```

---

## Decision: Skip Remote for Now?

### ✅ YES - Use Local Only During Phase 2

**Why**:
- Faster TDD iteration
- No remote DB coordination needed yet
- Can apply to remote when feature-complete
- CI/CD works with local

**Workflow**:
```bash
# Development (Phase 2)
1. Work against local DB
2. Generate types from local
3. Commit migrations + types

# Deployment (Phase 3+)
1. Apply migrations to remote via Dashboard
2. Regenerate types from remote
3. Deploy app
```

### Decision Point: Remote Migration Timing

**Option A: Apply Phase 1 to Remote Now**
- ✅ Remote DB secured with RLS
- ✅ Types match production
- ❌ Extra work before starting Phase 2

**Option B: Apply Phase 1 to Remote Later**
- ✅ Start Phase 2 immediately
- ✅ Use local for fast iteration
- ⚠️ Remote DB unsecured (if it's production, do Option A)

---

## Recommendation

**For Phase 2 Development**:
1. ✅ Use local DB exclusively
2. ✅ Generate types from local
3. ✅ Fast TDD iteration
4. ✅ Apply to remote when Phase 2 complete

**For Production Safety**:
- If remote DB has real users → Apply Phase 1 migrations now (Dashboard)
- If remote DB is staging/dev → Apply later when ready

---

## Quick Commands Reference

```bash
# Local DB
npx supabase db reset --local              # Reset to latest migrations
npx supabase gen types typescript --local  # Generate types from local

# Remote DB
npm run db:types                           # Generate types from remote
# Manual migration: Dashboard SQL Editor

# Development
npm run dev                                # Uses local Supabase
npm run test:watch                         # Test against local DB

# CI/CD
npx supabase db reset --local             # CI runs migrations
npm run test:ci                            # CI tests against local
```
