import copy
import json

import pytest


def test_shared_coverage_policy_reaches_derivation_and_grounding(system, monkeypatch):
    system.ready()
    candidate = system.response()
    prompts = []
    def prompt(text, **kwargs):
        prompts.append(text)
        return {"supported": True} if "VERISTEP_GROUNDING_V1" in text else candidate
    monkeypatch.setattr(system.m.gl.nondet, "exec_prompt", prompt)
    assert system.m._validate_leader(system.snapshot(), system.m.gl.vm.Return(candidate)) is True
    assert len(prompts) == 2
    assert all(system.m.COVERAGE_POLICY in text for text in prompts)
    assert "Do not infer absence of a prerequisite" in system.m.COVERAGE_POLICY


def test_coverage_disagreement_still_rejects_before_grounding(system, monkeypatch):
    system.ready()
    candidate = system.response()
    independent = copy.deepcopy(candidate)
    independent["assessments"][1]["status"] = "VIOLATED"
    calls = []
    def prompt(text, **kwargs):
        calls.append(text)
        return independent
    monkeypatch.setattr(system.m.gl.nondet, "exec_prompt", prompt)
    assert system.m._validate_leader(system.snapshot(), system.m.gl.vm.Return(candidate)) is False
    assert len(calls) == 1


def test_grounding_can_reject_matching_coverage_labels(system, monkeypatch):
    system.ready()
    candidate = system.response()
    def prompt(text, **kwargs):
        return {"supported": False} if "VERISTEP_GROUNDING_V1" in text else candidate
    monkeypatch.setattr(system.m.gl.nondet, "exec_prompt", prompt)
    assert system.m._validate_leader(system.snapshot(), system.m.gl.vm.Return(candidate)) is False


@pytest.mark.parametrize("index", range(5))
@pytest.mark.parametrize("status", ["SATISFIED", "VIOLATED"])
@pytest.mark.parametrize("removed_role", [0, 1])
def test_each_determinate_assessment_requires_both_roles(system, index, status, removed_role):
    system.ready(verify_source=True)
    response = system.response(status, status)
    response["assessments"][index]["citations"].pop(removed_role)
    with system.vm.expect_revert("Missing source/deliverable citation"):
        system.m._parse_response(response, system.snapshot())


def test_regenerate_once_with_same_full_evidence(system, monkeypatch):
    system.ready(source="Context. " * 230 + "Final exception: trial accounts cannot export.")
    valid = system.response()
    invalid = copy.deepcopy(valid)
    invalid["assessments"][0]["citations"].pop()
    calls = []
    def prompt(text, **kwargs):
        calls.append((text, kwargs))
        return invalid if len(calls) == 1 else valid
    monkeypatch.setattr(system.m.gl.nondet, "exec_prompt", prompt)
    assert system.m._derive(system.snapshot()) == valid
    assert len(calls) == 2
    assert calls[1][0].startswith(calls[0][0])
    assert "FORMAT_RETRY" in calls[1][0]
    for text, kwargs in calls:
        assert "Final exception: trial accounts cannot export." in text
        assert kwargs == {"response_format": "json"}


def test_two_invalid_outputs_fail_without_state_change(system, monkeypatch):
    system.ready()
    system.sender(system.client)
    system.c.request_review("demo-job")
    before = system.job()
    invalid = system.response()
    invalid["assessments"][0]["citations"].pop()
    calls = []
    def prompt(*args, **kwargs):
        calls.append(args)
        return copy.deepcopy(invalid)
    monkeypatch.setattr(system.m.gl.nondet, "exec_prompt", prompt)
    with system.vm.expect_revert("Missing source/deliverable citation"):
        system.c.resolve_review("demo-job")
    assert len(calls) == 2
    assert system.job() == before


def test_invalid_snapshot_does_not_call_model(system, monkeypatch):
    system.ready()
    snapshot = system.snapshot()
    snapshot["artifacts"][0]["content"] += "changed"
    def forbidden(*args, **kwargs):
        pytest.fail("A provenance failure must never reach the model")
    monkeypatch.setattr(system.m.gl.nondet, "exec_prompt", forbidden)
    with system.vm.expect_revert("Evidence identity/hash mismatch"):
        system.m._derive(snapshot)


def test_valid_first_output_not_rerolled_and_skeleton_has_no_verdict(system, monkeypatch):
    system.ready(verify_source=True)
    valid = system.response("VIOLATED", "SATISFIED")
    calls = []
    def prompt(text, **kwargs):
        calls.append(text)
        return valid
    monkeypatch.setattr(system.m.gl.nondet, "exec_prompt", prompt)
    assert system.m._derive(system.snapshot()) == valid
    assert len(calls) == 1
    skeleton = json.loads(calls[0].split("OUTPUT_SKELETON_JSON\n")[1].split("\nBEGIN_UNTRUSTED_INPUT_JSON")[0])
    assert skeleton["reviewed_chunks"] == valid["reviewed_chunks"]
    for item, obligation in zip(skeleton["assessments"], system.snapshot()["obligations"]):
        assert item["status"] == "CHOOSE_STATUS"
        assert [c["chunk_id"].split(":")[0] for c in item["citations"]] == obligation["evidence_roles"]


def test_transport_failure_is_not_format_retry(system, monkeypatch):
    system.ready()
    calls = []
    def prompt(*args, **kwargs):
        calls.append(args)
        raise system.m.gl.vm.UserError("[TRANSIENT] unavailable")
    monkeypatch.setattr(system.m.gl.nondet, "exec_prompt", prompt)
    with system.vm.expect_revert("unavailable"):
        system.m._derive(system.snapshot())
    assert len(calls) == 1
