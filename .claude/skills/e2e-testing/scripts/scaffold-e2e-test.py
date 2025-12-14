#!/usr/bin/env python3
"""
E2E Test Scaffolding Script

Generates a new Playwright E2E test file with PT-2 standard structure,
including proper imports, test scenario setup, and cleanup patterns.

Usage:
    python scaffold-e2e-test.py <test-name> [--type workflow|api]

Examples:
    python scaffold-e2e-test.py player-registration --type workflow
    python scaffold-e2e-test.py visits --type api
"""

import argparse
import os
from datetime import datetime
from pathlib import Path

WORKFLOW_TEMPLATE = '''/**
 * {title} E2E Test
 *
 * Tests the complete {name} workflow:
 * - TODO: Add workflow steps
 *
 * Verifies:
 * - TODO: Add verification points
 *
 * @see QA-001 for coverage requirements
 * @see ADR-002 for test organization
 */

import {{ test, expect }} from "@playwright/test";

import {{ createTestScenario }} from "../fixtures/test-data";
import type {{ TestScenario }} from "../fixtures/test-data";

test.describe("{title} Workflow E2E", () => {{
  let scenario: TestScenario;

  test.beforeEach(async () => {{
    // Create fresh test data for each test
    scenario = await createTestScenario();
  }});

  test.afterEach(async () => {{
    // Clean up test data
    if (scenario?.cleanup) {{
      await scenario.cleanup();
    }}
  }});

  test("completes {name} happy path", async ({{ request }}) => {{
    // Helper to create authenticated request headers
    const authHeaders = {{
      "Content-Type": "application/json",
      Authorization: `Bearer ${{scenario.authToken}}`,
    }};

    // STEP 1: TODO - First action
    await test.step("TODO: First action", async () => {{
      // const response = await request.post("/api/v1/...", {{
      //   data: {{}},
      //   headers: authHeaders,
      // }});
      // expect(response.ok()).toBeTruthy();
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

  test("handles error case: TODO", async ({{ request }}) => {{
    const authHeaders = {{
      "Content-Type": "application/json",
      Authorization: `Bearer ${{scenario.authToken}}`,
    }};

    // TODO: Test error handling
    await test.step("TODO: Trigger error condition", async () => {{
      // const response = await request.post("/api/v1/...", {{
      //   data: {{ /* invalid data */ }},
      //   headers: authHeaders,
      // }});
      // expect(response.ok()).toBeFalsy();
      // expect(response.status()).toBe(400);
    }});
  }});
}});
'''

API_TEMPLATE = '''/**
 * {title} API E2E Tests
 *
 * Tests the {name} API endpoints:
 * - GET /api/v1/{name}
 * - POST /api/v1/{name}
 * - GET /api/v1/{name}/{{id}}
 * - PUT /api/v1/{name}/{{id}}
 * - DELETE /api/v1/{name}/{{id}}
 *
 * @see QA-001 for coverage requirements
 * @see ADR-002 for test organization
 */

import {{ test, expect }} from "@playwright/test";

import {{ createTestScenario }} from "../../fixtures/test-data";
import type {{ TestScenario }} from "../../fixtures/test-data";

test.describe("{title} API E2E", () => {{
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
    test("creates resource with valid data", async ({{ request }}) => {{
      const response = await request.post("/api/v1/{name}", {{
        data: {{
          // TODO: Add valid payload
        }},
        headers: getAuthHeaders(),
      }});

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(body.data.id).toBeDefined();
    }});

    test("rejects invalid data with 400", async ({{ request }}) => {{
      const response = await request.post("/api/v1/{name}", {{
        data: {{
          // TODO: Add invalid payload
        }},
        headers: getAuthHeaders(),
      }});

      expect(response.status()).toBe(400);
    }});

    test("requires authentication", async ({{ request }}) => {{
      const response = await request.post("/api/v1/{name}", {{
        data: {{}},
        // No auth header
      }});

      expect(response.status()).toBe(401);
    }});
  }});

  test.describe("GET /api/v1/{name}", () => {{
    test("returns list for authenticated user", async ({{ request }}) => {{
      const response = await request.get("/api/v1/{name}", {{
        headers: getAuthHeaders(),
      }});

      expect(response.ok()).toBeTruthy();
      const body = await response.json();
      expect(Array.isArray(body.data)).toBe(true);
    }});
  }});

  test.describe("GET /api/v1/{name}/{{id}}", () => {{
    test("returns resource by ID", async ({{ request }}) => {{
      // TODO: Create resource first, then fetch by ID
      // const createResponse = await request.post("/api/v1/{name}", {{...}});
      // const {{ data: {{ id }} }} = await createResponse.json();
      //
      // const response = await request.get(`/api/v1/{name}/${{id}}`, {{
      //   headers: getAuthHeaders(),
      // }});
      // expect(response.ok()).toBeTruthy();
    }});

    test("returns 404 for non-existent ID", async ({{ request }}) => {{
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


def scaffold_test(test_name: str, test_type: str, output_dir: str) -> str:
    """Generate a new E2E test file."""
    title = to_title_case(test_name)

    if test_type == "workflow":
        template = WORKFLOW_TEMPLATE
        subdir = "workflows"
        filename = f"{test_name}.spec.ts"
    else:
        template = API_TEMPLATE
        subdir = "api/endpoints"
        filename = f"{test_name}.spec.ts"

    content = template.format(
        name=test_name,
        title=title,
    )

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
        description="Scaffold a new Playwright E2E test file"
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
        "--output",
        default=".",
        help="Output directory (default: current directory)"
    )

    args = parser.parse_args()

    try:
        output_path = scaffold_test(args.name, args.type, args.output)
        print(f"Created E2E test file: {output_path}")
        print()
        print("Next steps:")
        print("1. Fill in the TODO sections with your test logic")
        print("2. Run with: npx playwright test e2e/...")
        print("3. Debug with: npx playwright test --ui")
    except FileExistsError as e:
        print(f"Error: {e}")
        return 1
    except Exception as e:
        print(f"Error: {e}")
        return 1

    return 0


if __name__ == "__main__":
    exit(main())
