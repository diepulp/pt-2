"""
WS4 / EXEC-091 — Gate B (Render-Path / Derived-Value Surface) classifier tests.

Authority: FIB-H-RENDER-PROOF-001 §F.3 (Gate B classifier), §F.7 (validation
fixtures), §J (acceptance gates). Script under test:
    .claude/skills/build-pipeline/scripts/classify-render-path.py

SCOPE BOUNDARY — what is and is NOT unit-testable here (§F.4 vs §F.3):
  The classifier is a STAGE-3 SIGNAL emitter. It answers a single question from
  spec text: does this slice DECLARE a derived-value surface, and if so via which
  signal (primary flag vs governed *Projection-suffix GET route), and which Gate-B
  tiers are warranted. That is ALL it emits, and that is ALL this module asserts.

  The §F.7 "PRD-091 delivered passes" and "PRD-090 original blocks" cases are
  Phase-4 PRESENCE / EXECUTION behaviors (§F.4): file-existence of the three
  warranted tiers plus a real `jest.integration.config.js` run against the live
  DB/route. They are enforced by SKILL.md gate logic, NOT by this classifier, and
  the script exposes no presence/existence helper to drive them. We therefore do
  NOT fabricate those outcomes against the script — they are out of scope for the
  classifier and covered elsewhere in the pipeline.

  Per §F.3, the non-route derived surface with NO flag and NO *Projection GET
  route is a DECLARED-OPEN honor-system hole: it correctly returns `none`. The
  B-nonroute-noflag case below asserts that escape as INTENDED behavior, not a bug.

Module-loading note: the script filename contains a hyphen, so it is loaded via
importlib.util.spec_from_file_location rather than a normal import.

Runs green under both `python3 -m pytest` and `python3 -m unittest`.
"""

import importlib.util
import io
import json
import unittest
from contextlib import redirect_stdout, redirect_stderr
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent.parent
_SCRIPT_PATH = _SCRIPTS_DIR / "classify-render-path.py"
_FIXTURE_DIR = _SCRIPTS_DIR.parent / "__tests__" / "fixtures" / "render-proof"


def _load_module():
    spec = importlib.util.spec_from_file_location(
        "classify_render_path_under_test", _SCRIPT_PATH
    )
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


crp = _load_module()


def _fx(name: str) -> Path:
    p = _FIXTURE_DIR / name
    assert p.is_file(), f"missing fixture: {p}"
    return p


def _classify(name: str) -> dict:
    return crp.classify_paths(_fx(name), None)


class GateBFixtureSanity(unittest.TestCase):
    def test_script_and_fixtures_exist(self):
        self.assertTrue(_SCRIPT_PATH.is_file(), _SCRIPT_PATH)
        self.assertTrue(_FIXTURE_DIR.is_dir(), _FIXTURE_DIR)


class GateBPrimaryFlag(unittest.TestCase):
    """§J derived_value_flag_triggers_service_route_and_component_tiers."""

    def test_b_primary_flag_triggers_all_three_tiers(self):
        result = _classify("b-primary-flag.spec.fixture.md")
        self.assertTrue(result["detected"])
        self.assertEqual(result["classification"], "derived_value")
        self.assertEqual(result["signal"], "primary_flag")
        self.assertEqual(
            result["warranted_tiers"],
            ["service_db_int", "route_int", "component_render"],
        )

    def test_b_alias_flag_triggers_primary(self):
        # renders_financial_surface_values (instance #1 alias, §F.3 / §I.1.a).
        result = _classify("b-alias-flag.spec.fixture.md")
        self.assertEqual(result["classification"], "derived_value")
        self.assertEqual(result["signal"], "primary_flag")

    def test_b_false_flag_returns_none(self):
        result = _classify("b-false-flag.spec.fixture.md")
        self.assertEqual(result["classification"], "none")
        self.assertEqual(result["signal"], "none")
        self.assertEqual(result["warranted_tiers"], [])


class GateBSecondaryProjectionDTO(unittest.TestCase):
    """§J projection_suffix_route_triggers_detection (PRD-090 analog, no flag)."""

    def test_b_route_projection_get_detected_via_suffix(self):
        result = _classify("b-route-projection-get.fixture.ts")
        self.assertTrue(result["detected"])
        self.assertEqual(result["classification"], "derived_value")
        self.assertEqual(result["signal"], "secondary_projection_dto")
        self.assertEqual(len(result["warranted_tiers"]), 3)

    def test_b_plain_get_returns_none(self):
        # §J plain_non_derived_read_returns_none — GET returning a plain
        # *ResponseDTO (not a Projection DTO), no flag.
        result = _classify("b-plain-get.fixture.ts")
        self.assertEqual(result["classification"], "none")
        self.assertEqual(result["signal"], "none")

    def test_b_suffix_guard_midname_does_not_match(self):
        # `ProjectionConfigResponseDTO` — `Projection` mid-name, not the frozen
        # suffix. $-anchor must reject it even on a GET route.
        result = _classify("b-suffix-guard-get.fixture.ts")
        self.assertEqual(result["classification"], "none")
        self.assertEqual(result["signal"], "none")

    def test_b_verb_guard_post_projection_does_not_match(self):
        # Secondary signal is GET-scoped; a POST returning a Projection DTO is
        # owned by the write-path classifier, not this one.
        result = _classify("b-verb-guard-post.fixture.ts")
        self.assertEqual(result["classification"], "none")
        self.assertEqual(result["signal"], "none")


class GateBNonRouteHole(unittest.TestCase):
    """
    §F.3 / §K.5 honor-system limit. A non-route derived surface is detectable
    ONLY via the primary flag; with the flag omitted it ESCAPES by design.
    """

    def test_b_nonroute_with_flag_detected_only_via_primary(self):
        # §J non_route_derived_surface_detected_only_via_flag
        result = _classify("b-nonroute-flag.spec.fixture.md")
        self.assertTrue(result["detected"])
        self.assertEqual(result["classification"], "derived_value")
        self.assertEqual(result["signal"], "primary_flag")

    def test_b_nonroute_without_flag_escapes_detection(self):
        # §J non_route_derived_surface_without_flag_escapes_detection.
        # INTENDED NEGATIVE — declared-open hole, NOT a script bug. Must be none.
        result = _classify("b-nonroute-noflag.spec.fixture.md")
        self.assertEqual(
            result["classification"],
            "none",
            "non-route derived surface without flag MUST escape (FIB §F.3 "
            "honor-system limit) — this is intended, not a bug",
        )
        self.assertEqual(result["signal"], "none")
        self.assertEqual(result["warranted_tiers"], [])
        self.assertFalse(result["detected"])


class GateBMountNotASignal(unittest.TestCase):
    """§J mounted_component_is_not_a_classification_signal (§F.3)."""

    def test_b_mount_reference_alone_returns_none(self):
        result = _classify("b-mount-only.spec.fixture.md")
        self.assertEqual(result["classification"], "none")
        self.assertEqual(result["signal"], "none")


class GateBDeterminism(unittest.TestCase):
    def test_identical_input_yields_identical_output(self):
        a = _classify("b-route-projection-get.fixture.ts")
        b = _classify("b-route-projection-get.fixture.ts")
        self.assertEqual(a, b)

        c = _classify("b-nonroute-noflag.spec.fixture.md")
        d = _classify("b-nonroute-noflag.spec.fixture.md")
        self.assertEqual(c, d)


class GateBPureClassifyAndCLI(unittest.TestCase):
    def test_classify_pure_function_safe_on_garbage(self):
        # Malformed/empty input must not crash; safe default is none.
        self.assertEqual(crp.classify("")["classification"], "none")
        self.assertEqual(
            crp.classify(":::not yaml::: random")["classification"], "none"
        )

    def test_main_emits_json_and_exit_zero(self):
        out = io.StringIO()
        with redirect_stdout(out):
            rc = crp.main(
                [
                    "classify-render-path.py",
                    str(_fx("b-primary-flag.spec.fixture.md")),
                ]
            )
        self.assertEqual(rc, 0)
        payload = json.loads(out.getvalue())
        self.assertEqual(payload["classification"], "derived_value")
        self.assertEqual(payload["signal"], "primary_flag")

    def test_main_missing_args_returns_two(self):
        err = io.StringIO()
        with redirect_stderr(err):
            rc = crp.main(["classify-render-path.py"])
        self.assertEqual(rc, 2)

    def test_main_missing_prd_returns_two(self):
        err = io.StringIO()
        with redirect_stderr(err):
            rc = crp.main(
                ["classify-render-path.py", "/nonexistent/prd.md"]
            )
        self.assertEqual(rc, 2)

    def test_exec_spec_text_is_combined(self):
        # A flag in the EXEC-SPEC arg must also trip detection (combined text).
        result = crp.classify_paths(
            _fx("b-false-flag.spec.fixture.md"),  # no live flag
            _fx("b-primary-flag.spec.fixture.md"),  # flag here
        )
        self.assertEqual(result["classification"], "derived_value")
        self.assertEqual(result["signal"], "primary_flag")


if __name__ == "__main__":
    unittest.main()
