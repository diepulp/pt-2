Minimalistic Phase overhead files <100 lines Enforce critical guardrails lint typecheck tests build Defer TODO MVP baseline fast feedback<2min

Step 1 Single CI Workflow Create.github/workflows.yml pull_request-latest steps actions@v4 Setup Node.js-node node-version 20 lint type-check test No coverage reports PR title enforcement file-size scan 1 file ~30 lines 4 quality gates

Step 2 Lightweight Pre-commit Hooks Add.husky file.sh run lint-staged lint-staged.config.js export default --write enforces code quality before

Step 3 Branch Protection require CI merge layer approvals checks MVP

Step 4 Phase 0 smoke test wiring Phase 2 expand unit tests Aligns Guardrails avoids gold-plating TDD 2 CI feedback <2min no extra jobs artifacts coverage extend coverage semantic checks start minimum 1–2) revisit CI hardening ADR checks risk weeks Phase 0 building plumbing
