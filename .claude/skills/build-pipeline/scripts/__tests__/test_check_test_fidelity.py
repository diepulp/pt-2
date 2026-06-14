"""
WS4 / EXEC-091 — Gate A (Universal Test Fidelity) unit tests.

Authority: FIB-H-RENDER-PROOF-001 §F.2 (Gate A), §F.7 (validation fixtures),
§J (acceptance gates). Script under test:
    .claude/skills/build-pipeline/scripts/check-test-fidelity.py

What Gate A actually emits (and what this module verifies):
  - Targeted detection of a Supabase CLIENT-CONSTRUCTOR jest.mock() inside
    integration-named test files; unrelated-module mocks must NOT flag.
  - An `// integration-fidelity:allow <reason>` directive (non-empty reason, same
    or immediately-preceding line) clears a flagged line into `cleared[]`.
  - Scope is CALLER-supplied: only int-named files (`.int.test.ts` /
    `.integration.test.ts`) are inspected; everything else is ignored. A mocked
    int file NOT in the passed touched-set surfaces no violation (§J
    legacy_mocked_int_file_outside_slice_does_not_block).

Module-loading note: the script filename contains hyphens, so it is not a normal
import name. It is loaded via importlib.util.spec_from_file_location.

Fixture-naming note (§F.4 vs §F.3 boundary): the validation fixtures live under
`.claude/skills/build-pipeline/__tests__/fixtures/render-proof/` with a
`.fixture.ts` infix so Jest does NOT collect them as live tests. That same infix
makes them invisible to Gate A's own `is_int_file` suffix scope (it keys on
`.int.test.ts`). Pattern/clear behavior is therefore exercised via `scan()`
(which inspects a file directly, bypassing the scope filter), while the
scope/verdict behavior (`check_files`, `main`, A4 outside-slice) is exercised by
materializing a fixture under a real `.int.test.ts` name in a tmp dir. This keeps
the fixtures both Jest-safe and faithful to the script's real I/O.

Runs green under both `python3 -m pytest` and `python3 -m unittest`.
"""

import importlib.util
import io
import json
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

# --- locate + load the hyphenated script as a module ------------------------
_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
_SCRIPT_PATH = _SCRIPTS_DIR / "check-test-fidelity.py"
_FIXTURE_DIR = (
    _SCRIPTS_DIR.parent / "__tests__" / "fixtures" / "render-proof"
)


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "check_test_fidelity_under_test", _SCRIPT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


ctf = _load_module()


def _fx(name: str) -> Path:
    p = _FIXTURE_DIR / name
    assert p.is_file(), f"missing fixture: {p}"
    return p


class GateAFixtureSanity(unittest.TestCase):
    def test_script_and_fixtures_exist(self):
        self.assertTrue(_SCRIPT_PATH.is_file(), _SCRIPT_PATH)
        self.assertTrue(_FIXTURE_DIR.is_dir(), _FIXTURE_DIR)


class GateAClientConstructorDetection(unittest.TestCase):
    """§J gate_a_synthetic_fixture_fails_on_mocked_client_constructor."""

    def test_a1_mocked_client_constructor_flags(self):
        result = ctf.scan(_fx("a1-mocked-client.int.test.fixture.ts"))
        self.assertEqual(len(result["violations"]), 1)
        self.assertEqual(len(result["cleared"]), 0)
        self.assertEqual(
            result["violations"][0]["pattern"], "supabase-client-constructor"
        )

    def test_a2_unrelated_module_mock_with_real_db_passes(self):
        # §J unrelated_module_mock_with_real_db_passes — a real client + only
        # unrelated-module mocks ('@/services/notifications/sender', '../mappers').
        result = ctf.scan(
            _fx("a2-real-client-unrelated-mock.int.test.fixture.ts")
        )
        self.assertEqual(result["violations"], [])
        self.assertEqual(result["cleared"], [])

    def test_relative_and_package_constructor_forms_flag(self):
        # Relative `../supabase/client` AND upstream `@supabase/supabase-js`.
        result = ctf.scan(_fx("a-relative-and-pkg.int.test.fixture.ts"))
        patterns = sorted(v["pattern"] for v in result["violations"])
        self.assertEqual(
            patterns, ["supabase-client-constructor", "supabase-supabase-js"]
        )

    def test_near_miss_paths_do_not_flag(self):
        # bare `../client` (no supabase/ segment) and `supabase/admin`
        # (not a server|client|service terminal) must NOT flag.
        result = ctf.scan(_fx("a-near-miss-paths.int.test.fixture.ts"))
        self.assertEqual(result["violations"], [])


class GateAAllowDirective(unittest.TestCase):
    """§J allow_comment_overrides_flagged_line (+ bare-directive negative)."""

    def test_a3_allow_comment_clears_flagged_line(self):
        result = ctf.scan(
            _fx("a3-mocked-client-allow-comment.int.test.fixture.ts")
        )
        self.assertEqual(result["violations"], [])
        self.assertEqual(len(result["cleared"]), 1)
        self.assertIn(
            "legacy mock pending Mode C rewrite",
            result["cleared"][0]["reason"],
        )

    def test_a3_negative_bare_allow_does_not_clear(self):
        # A reasonless `// integration-fidelity:allow` must NOT clear.
        result = ctf.scan(_fx("a3neg-bare-allow.int.test.fixture.ts"))
        self.assertEqual(len(result["violations"]), 1)
        self.assertEqual(result["cleared"], [])

    def test_allow_reason_helper_requires_nonempty_reason(self):
        self.assertEqual(
            ctf.allow_reason("// integration-fidelity:allow real reason"),
            "real reason",
        )
        self.assertIsNone(ctf.allow_reason("// integration-fidelity:allow"))
        self.assertIsNone(ctf.allow_reason("// no directive here"))


class GateAScope(unittest.TestCase):
    """int-file scope: §J legacy_mocked_int_file_outside_slice_does_not_block."""

    def test_is_int_file_recognizes_only_canonical_int_suffixes(self):
        self.assertTrue(ctf.is_int_file(Path("x.int.test.ts")))
        self.assertTrue(ctf.is_int_file(Path("x.integration.test.ts")))
        # The Jest-safe `.fixture.ts` infix is intentionally OUT of scope.
        self.assertFalse(ctf.is_int_file(Path("x.int.test.fixture.ts")))
        self.assertFalse(ctf.is_int_file(Path("x.test.ts")))

    def test_non_int_file_in_touched_set_is_ignored(self):
        # A non-int file that mocks the client must produce NO signals when
        # routed through check_files (the int-suffix scope filter drops it).
        result = ctf.check_files(
            [_fx("a-nonint-mocked-client.test.fixture.ts")]
        )
        self.assertFalse(result["detected"])
        self.assertEqual(result["violations"], [])

    def test_a4_mocked_int_file_outside_slice_does_not_block(self):
        # The mocked int file is NOT in the passed touched-set; the caller
        # passes only an unrelated (non-int) file. No violation surfaces.
        result = ctf.check_files(
            [_fx("a-nonint-mocked-client.test.fixture.ts")]
        )
        self.assertFalse(result["detected"])
        self.assertEqual(result["violations"], [])

    def test_empty_touched_set_detects_nothing(self):
        result = ctf.check_files([])
        self.assertFalse(result["detected"])
        self.assertEqual(result["violations"], [])
        self.assertEqual(result["cleared"], [])


class GateAEndToEndVerdict(unittest.TestCase):
    """
    Exercise check_files / main on a real `.int.test.ts`-suffixed file so the
    int-suffix scope filter recognizes it (the fixture's `.fixture.ts` infix is
    Jest-safe but out of Gate A scope by design).
    """

    def _materialize(self, fixture_name: str, tmp_path: Path) -> Path:
        src = _fx(fixture_name)
        dst = tmp_path / "materialized.int.test.ts"
        dst.write_text(src.read_text(encoding="utf-8"), encoding="utf-8")
        return dst

    def test_check_files_detected_true_on_mocked_client(self):
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            dst = self._materialize(
                "a1-mocked-client.int.test.fixture.ts", Path(td)
            )
            result = ctf.check_files([dst])
            self.assertTrue(result["detected"])
            self.assertEqual(len(result["violations"]), 1)

    def test_check_files_detected_false_on_cleared_file(self):
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            dst = self._materialize(
                "a3-mocked-client-allow-comment.int.test.fixture.ts",
                Path(td),
            )
            result = ctf.check_files([dst])
            self.assertFalse(result["detected"])
            self.assertEqual(len(result["cleared"]), 1)

    def test_main_emits_json_and_exit_zero(self):
        import tempfile

        with tempfile.TemporaryDirectory() as td:
            dst = self._materialize(
                "a1-mocked-client.int.test.fixture.ts", Path(td)
            )
            out = io.StringIO()
            with redirect_stdout(out):
                rc = ctf.main(["check-test-fidelity.py", str(dst)])
            self.assertEqual(rc, 0)  # scan-completed exit, regardless of verdict
            payload = json.loads(out.getvalue())
            self.assertTrue(payload["detected"])
            self.assertIn("violations", payload)
            self.assertIn("cleared", payload)

    def test_main_missing_args_returns_two(self):
        err = io.StringIO()
        with redirect_stderr(err):
            rc = ctf.main(["check-test-fidelity.py"])
        self.assertEqual(rc, 2)

    def test_main_read_error_returns_two(self):
        # A non-existent int-named file is in scope and must trigger the read
        # error path → exit 2.
        err = io.StringIO()
        with redirect_stderr(err):
            rc = ctf.main(
                ["check-test-fidelity.py", "/nonexistent/path/x.int.test.ts"]
            )
        self.assertEqual(rc, 2)


if __name__ == "__main__":
    unittest.main()
