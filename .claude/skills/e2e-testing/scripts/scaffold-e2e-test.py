#!/usr/bin/env python3
"""
E2E Test Scaffolding Script

Generates a new Playwright E2E test file with QA-006-compliant structure,
including auth mode, verification class, proper imports, and cleanup patterns.

Usage:
    python scaffold-e2e-test.py <test-name> [--type workflow|api] [--mode A|B|C]

Examples:
    python scaffold-e2e-test.py player-registration --type workflow --mode B
    python scaffold-e2e-test.py table-fills --type api --mode C
    python scaffold-e2e-test.py floor-layouts --type api --mode A
"""

import argparse
from pathlib import Path

# Mode metadata for verification taxonomy (QA-006 §1)
MODE_META = {
    "A": {
        "class": "Local Verification",
        "label": "Mode A (dev bypass)",
        "comment": "// Mode A — dev auth bypass. Only for read-only local verification.",
    },
    "B": {
        "class": "E2E",
        "label": "Mode B (browser login)",
        "comment": "// Mode B — canonical browser E2E. Real browser/app surface under test.",
    },
    "C": {
        "class": "System Verification",
        "label": "Mode C (authenticated client)",
        "comment": "// Mode C — system/API verification. Real JWT/RPC/RLS, bypasses browser.",
    },
}

WORKFLOW_TEMPLATE = '''/**
 * {title} E2E Test
 *
 * {mode_comment}
 *
 * Tests the complete {name} workflow:
 * - TODO: Add workflow steps
 *
 * Verifies:
 * - TODO: Add verification points
 *
 * @see QA-006 for E2E testing standard
 * @see QA-001 for coverage requirements
 */

import {{ test, expect }} from "@playwright/test";
import {{ randomUUID }} from "crypto";

import {{ createTestScenario }} from "../fixtures/test-data";
import type {{ TestScenario }} from "../fixtures/test-data";

test.describe("{title} — {verification_class} — {mode_label}", () => {{
  let scenario: TestScenario;

  test.beforeEach(async () => {{
    // Create fresh test data with collision-resistant identifiers
    scenario = await createTestScenario();
  }});

  test.afterEach(async () => {{
    // Clean up only this test's data (scoped by IDs, not broad casino sweep)
    if (scenario?.cleanup) {{
      await scenario.cleanup();
    }}
  }});

  test("should complete {name} happy path", async ({{ {test_arg} }}) => {{
    {mode_b_login}
    // STEP 1: TODO - First action
    await test.step("TODO: First action", async () => {{
      {step_example}
    }});

    // STEP 2: TODO - Second action
    await test.step("TODO: Second action", async () => {{
      // Add test logic
    }});

    // STEP 3: TODO - Verify final state
    await test.step("TODO: Verify final state", async () => {{
      // Add assertions
    }});
  }});

  test("should handle error case: TODO", async ({{ {test_arg} }}) => {{
    {mode_b_login_error}
    await test.step("TODO: Trigger error condition", async () => {{
      {error_step_example}
    }});
  }});
}});
'''

API_TEMPLATE = '''/**
 * {title} API Tests
 *
 * {mode_comment}
 *
 * Tests the {name} API endpoints:
 * - GET /api/v1/{name}
 * - POST /api/v1/{name}
 * - GET /api/v1/{name}/{{id}}
 *
 * @see QA-006 for E2E testing standard
 * @see QA-001 for coverage requirements
 */

import {{ test, expect }} from "@playwright/test";
import {{ randomUUID }} from "crypto";

import {{ createTestScenario }} from "../fixtures/test-data";
import type {{ TestScenario }} from "../fixtures/test-data";

test.describe("{title} API — {verification_class} — {mode_label}", () => {{
  let scenario: TestScenario;

  test.beforeEach(async () => {{
    scenario = await createTestScenario();
  }});

  test.afterEach(async () => {{
    if (scenario?.cleanup) {{
      await scenario.cleanup();
    }}
  }});

  const getAuthHeaders = () => ({{
    "Content-Type": "application/json",
    Authorization: `Bearer ${{scenario.authToken}}`,
  }});

  test.describe("POST /api/v1/{name}", () => {{
    test("should create resource with valid data", async ({{ request }}) => {{
      const response = await request.post("/api/v1/{name}", {{
        data: {{
          // TODO: Add valid payload
        }},
        headers: {{
          ...getAuthHeaders(),
          "Idempotency-Key": randomUUID(),
        }},
      }});

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.data.id).toBeDefined();
    }});

    test("should reject invalid data with 400", async ({{ request }}) => {{
      const response = await request.post("/api/v1/{name}", {{
        data: {{
          // TODO: Add invalid payload
        }},
        headers: {{
          ...getAuthHeaders(),
          "Idempotency-Key": randomUUID(),
        }},
      }});

      expect(response.status()).toBe(400);
    }});

    test("should require authentication", async ({{ request }}) => {{
      const response = await request.post("/api/v1/{name}", {{
        data: {{}},
        // No auth header
      }});

      // Expect 401 (API routes should not redirect to login)
      expect(response.status()).toBe(401);
    }});
  }});

  test.describe("GET /api/v1/{name}", () => {{
    test("should return list for authenticated user", async ({{ request }}) => {{
      const response = await request.get("/api/v1/{name}", {{
        headers: getAuthHeaders(),
      }});

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(Array.isArray(body.data)).toBe(true);
    }});
  }});

  test.describe("GET /api/v1/{name}/{{id}}", () => {{
    test("should return 404 for non-existent ID", async ({{ request }}) => {{
      const response = await request.get(
        "/api/v1/{name}/00000000-0000-0000-0000-000000000000",
        {{ headers: getAuthHeaders() }}
      );

      expect(response.status()).toBe(404);
    }});
  }});
}});
'''


def to_title_case(name: str) -> str:
    """Convert kebab-case to Title Case."""
    return " ".join(word.capitalize() for word in name.split("-"))


def get_mode_specific_content(mode: str, test_type: str) -> dict:
    """Generate mode-specific template content."""
    meta = MODE_META[mode]
    result = {
        "verification_class": meta["class"],
        "mode_label": meta["label"],
        "mode_comment": meta["comment"],
    }

    if test_type == "workflow":
        if mode == "B":
            result["test_arg"] = "page"
            result["mode_b_login"] = (
                "// Browser login (Mode B — canonical E2E)\n"
                "    // await authenticateViaLogin(page, scenario.email, scenario.password);\n"
            )
            result["mode_b_login_error"] = result["mode_b_login"]
            result["step_example"] = (
                "// Navigate and interact with real app surface\n"
                "      // await page.goto('/path');\n"
                "      // await page.getByRole('button', { name: 'Action' }).click();\n"
                "      // await expect(page.getByText('Success')).toBeVisible();"
            )
            result["error_step_example"] = (
                "// Test error handling through real UI\n"
                "      // await page.goto('/path');\n"
                "      // await expect(page.getByText('Error message')).toBeVisible();"
            )
        elif mode == "C":
            result["test_arg"] = "request"
            result["mode_b_login"] = ""
            result["mode_b_login_error"] = ""
            result["step_example"] = (
                "// Authenticated API call (Mode C)\n"
                "      // const response = await request.post('/api/v1/...', {\n"
                "      //   data: {},\n"
                "      //   headers: {\n"
                "      //     Authorization: `Bearer ${scenario.authToken}`,\n"
                "      //     'Content-Type': 'application/json',\n"
                "      //     'Idempotency-Key': randomUUID(),\n"
                "      //   },\n"
                "      // });\n"
                "      // expect(response.ok()).toBeTruthy();"
            )
            result["error_step_example"] = (
                "// const response = await request.post('/api/v1/...', {\n"
                "      //   data: { /* invalid data */ },\n"
                "      //   headers: { Authorization: `Bearer ${scenario.authToken}` },\n"
                "      // });\n"
                "      // expect(response.ok()).toBeFalsy();\n"
                "      // expect(response.status()).toBe(400);"
            )
        else:  # Mode A
            result["test_arg"] = "request"
            result["mode_b_login"] = ""
            result["mode_b_login_error"] = ""
            result["step_example"] = (
                "// Dev bypass read (Mode A — local verification only)\n"
                "      // const response = await request.get('/api/v1/...', {\n"
                "      //   headers: { 'Content-Type': 'application/json' },\n"
                "      // });\n"
                "      // expect(response.ok()).toBeTruthy();"
            )
            result["error_step_example"] = (
                "// const response = await request.get('/api/v1/invalid-path');\n"
                "      // expect(response.ok()).toBeFalsy();"
            )

    return result


def scaffold_test(test_name: str, test_type: str, mode: str, output_dir: str) -> str:
    """Generate a new E2E test file."""
    title = to_title_case(test_name)
    mode_content = get_mode_specific_content(mode, test_type)

    if test_type == "workflow":
        template = WORKFLOW_TEMPLATE
        subdir = "workflows"
    else:
        template = API_TEMPLATE
        subdir = "api"

    filename = f"{test_name}.spec.ts"

    format_args = {
        "name": test_name,
        "title": title,
        **mode_content,
    }

    content = template.format(**format_args)

    # Determine output path
    e2e_dir = Path(output_dir) / "e2e" / subdir
    e2e_dir.mkdir(parents=True, exist_ok=True)

    output_path = e2e_dir / filename

    if output_path.exists():
        raise FileExistsError(f"Test file already exists: {output_path}")

    output_path.write_text(content)
    return str(output_path)


def main():
    parser = argparse.ArgumentParser(
        description="Scaffold a new Playwright E2E test file (QA-006 compliant)"
    )
    parser.add_argument(
        "name",
        help="Test name in kebab-case (e.g., player-registration)"
    )
    parser.add_argument(
        "--type",
        choices=["workflow", "api"],
        default="workflow",
        help="Type of test to scaffold (default: workflow)"
    )
    parser.add_argument(
        "--mode",
        choices=["A", "B", "C"],
        default="B",
        help="Auth mode per QA-006 §1: A=dev bypass, B=browser login, C=authenticated client (default: B)"
    )
    parser.add_argument(
        "--output",
        default=".",
        help="Output directory (default: current directory)"
    )

    args = parser.parse_args()

    try:
        output_path = scaffold_test(args.name, args.type, args.mode, args.output)
        meta = MODE_META[args.mode]
        print(f"Created E2E test file: {output_path}")
        print(f"  Verification class: {meta['class']}")
        print(f"  Auth mode: {meta['label']}")
        print()
        print("Next steps:")
        print("1. Fill in the TODO sections with your test logic")
        print("2. Ensure describe block labeling matches QA-006 §1")
        print("3. Run with: npx playwright test e2e/...")
        print("4. Debug with: npx playwright test --ui")
    except FileExistsError as e:
        print(f"Error: {e}")
        return 1
    except Exception as e:
        print(f"Error: {e}")
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
