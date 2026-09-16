"""V2 deterministic core tests; no claim of web provenance or live consensus."""
import copy
import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import base64
from types import SimpleNamespace
from datetime import datetime, timezone

import pytest


@pytest.fixture
def core(direct_vm, direct_deploy, direct_alice, direct_owner):
    direct_vm.sender = direct_alice
    source = os.environ.get("VERISTEP_V2_TEST_SOURCE", "contracts/veristep.py")
    assert source in {"contracts/veristep.py", "contracts/veristep_release.py"}
    contract = direct_deploy(source, "0x" + direct_owner.hex(), sdk_version="v0.6.0-rc5")
    return contract, sys.modules[f"_contract_{Path(source).stem}"], direct_vm


def origin():
    return dict(provider="github", hostname="api.github.com", owner="example", owner_id=1, repository="policy", repository_id=2)


def artifact(raw=b"Approval is required.", content_type="text/plain"):
    return {"origin": origin(), "commit": "a" * 40, "path": "policy.json" if content_type == "application/json" else "policy.txt", "blob": "b" * 40, "content_type": content_type, "encoding": "utf-8", "byte_length": len(raw), "sha256": hashlib.sha256(raw).hexdigest()}


def terms():
    return {"workers": {"A": "0x" + "22" * 20, "B": "0x" + "33" * 20}, "origins": {r: origin() for r in ("SOURCE", "A", "B")}, "source": artifact(), "money": {r: {"fee": "10", "bond": "5", "penalty": "3"} for r in ("A", "B")}, "windows": {k: 60 for k in ("accept", "step", "review", "adjudication")}, "max_revisions": 0, "semantic_obligations": [{"id": "SEM_A_MEANING", "stage": "A", "statement": "Preserve conditions and exceptions of the source.", "evidence_ids": ["SOURCE", "A"]}, {"id": "SEM_B_FAITHFULNESS", "stage": "B", "statement": "Faithfully report A's complete output.", "evidence_ids": ["A", "B"]}]}


def candidate(m, raw=b"Approval is required."):
    obligations = m._obligations(m._terms(json.dumps(terms())), "0x" + "11" * 20)
    artifacts = {r: {"commitment": artifact(raw), "bytes": raw} for r in ("SOURCE", "A", "B")}
    response = {"reviewed_artifacts": [{"id": r, "sha256": artifact(raw)["sha256"], "byte_length": len(raw)} for r in artifacts], "assessments": []}
    for duty in obligations:
        if duty["kind"] == "SEMANTIC":
            response["assessments"].append({"obligation_id": duty["id"], "status": "SATISFIED", "reason": "Controlled test response, not real AI inference.", "missing_evidence_ids": [], "citations": [{"artifact_id": r, "sha256": artifact(raw)["sha256"], "quote": raw.decode()} for r in duty["evidence_ids"]]})
    return obligations, artifacts, response


def receipt(m):
    return dict(chain_id=4221, router=str(m.Address("0x" + "11" * 20)), source_contract=str(m.Address("0x" + "22" * 20)), deal_id="work-1", role="A", sequence=0, terms_hash="a" * 64, decision_hash="b" * 64, receipt_id="c" * 64, recipient=str(m.Address("0x" + "33" * 20)), amount="15", kind="PAYOUT", state="RELEASED")


def test_persist_exact_immutable_obligations(core):
    c, m, vm = core
    c.create_terms("work-1", json.dumps(terms()))
    before = c.get_terms("work-1")
    record = json.loads(before)
    assert record["status"] == "DRAFT_UNFUNDED"
    assert len(record["manifest"]["obligations"]) == 16
    assert record["terms_hash"] == m._digest(m._json(record["manifest"]).encode())
    with pytest.raises(m.gl.vm.UserError, match="DEAL_EXISTS"):
        c.create_terms("work-1", json.dumps(terms()))
    assert c.get_terms("work-1") == before
    capabilities = json.loads(c.get_capabilities())
    assert capabilities["funding"] is True and capabilities["external_review"] is True and capabilities["settlement"] is True
    assert capabilities["version"] == "veristep-2.0-rc"
    assert capabilities["status"] == "RELEASE_CANDIDATE"
    assert capabilities["router"].startswith("0x") and len(capabilities["router"]) == 42
    assert capabilities["router"].lower() == str(c.router).lower()


def test_public_lifecycle_keeps_review_and_receipt_authority_in_contract(core, monkeypatch):
    c, m, vm = core
    vm.warp("2026-09-12T00:00:00+00:00")
    m.gl.message.raw["datetime"] = "2026-09-12T00:00:00+00:00"
    client = str(m.gl.message.sender_address)
    c.create_terms("work-1", json.dumps(terms()))
    deal = json.loads(c.get_terms("work-1"))

    vm.value = 20
    c.fund_terms("work-1", deal["terms_hash"])
    vm.value = 0
    for worker in ("0x" + "22" * 20, "0x" + "33" * 20):
        vm.sender = m.Address(worker).as_bytes
        vm.value = 5
        c.accept_work("work-1", deal["terms_hash"])
        vm.value = 0

    deal = json.loads(c.get_terms("work-1"))
    vm.sender = m.Address("0x" + "22" * 20).as_bytes
    c.submit_artifact("work-1", json.dumps(artifact()), deal["artifacts"]["SOURCE"]["submission_id"])
    deal = json.loads(c.get_terms("work-1"))
    vm.sender = m.Address("0x" + "33" * 20).as_bytes
    c.submit_artifact("work-1", json.dumps(artifact()), deal["artifacts"]["A"]["submission_id"])
    vm.sender = bytes.fromhex(client[2:])
    c.request_review("work-1")

    deal = json.loads(c.get_terms("work-1"))
    commitments = {role: deal["artifacts"][role]["commitment"] for role in m.ROLES}
    artifacts = {role: {"commitment": commitments[role], "bytes": b"Approval is required."} for role in m.ROLES}
    for item in artifacts.values():
        commitment = item["commitment"]
        item["provenance"] = {"adapter": "github-commit-v1", "provider": commitment["origin"]["provider"], "hostname": commitment["origin"]["hostname"], "owner": commitment["origin"]["owner"], "owner_id": commitment["origin"]["owner_id"], "repository": commitment["origin"]["repository"], "repository_id": commitment["origin"]["repository_id"], "commit": commitment["commit"], "blob": commitment["blob"], "path": commitment["path"], "content_type": commitment["content_type"], "byte_length": commitment["byte_length"], "sha256": commitment["sha256"], "status": "VERIFIED"}
    obligations = deal["manifest"]["obligations"]
    _, _, semantic = candidate(m)
    monkeypatch.setattr(m, "_review_consensus", lambda actual_obligations, actual_commitments: {"artifacts": m._wire_artifacts(artifacts), "semantic": semantic})
    c.resolve_review("work-1")
    deal = json.loads(c.get_terms("work-1"))
    assert deal["status"] == "SETTLEMENT_PENDING"
    assert len(deal["report"]["obligation_assessments"]) == len(obligations)
    assert sum(int(leg["amount"]) for leg in deal["settlement_legs"]) == int(deal["ledger"]["received"]) == 30

    sends = []
    monkeypatch.setattr(
        m.gl.chain.Account,
        "emit_transfer",
        lambda account, amount, on="finalized": sends.append(
            (str(account.address), int(amount), on)
        ),
    )
    for original in list(deal["settlement_legs"]):
        c.route_settlement("work-1", original["id"])
        with pytest.raises(m.gl.vm.UserError, match="LEG_NOT_ELIGIBLE"):
            c.route_settlement("work-1", original["id"])
        routed = json.loads(c.get_terms("work-1"))
        leg = next(item for item in routed["settlement_legs"] if item["id"] == original["id"])
        assert leg["state"] == "DISPATCHED_UNVERIFIED"
        with pytest.raises(m.gl.vm.UserError, match="STUDIO_NEXT_NATIVE_RECEIPT_UNVERIFIED"):
            c.confirm_settlement("work-1", original["id"])
    pending = json.loads(c.get_terms("work-1"))
    assert pending["status"] == "SETTLEMENT_PENDING"
    assert pending["ledger"] == {"received": "30", "routed": "30", "confirmed": "0"}
    assert sends == [
        (leg["recipient"], int(leg["amount"]), "finalized")
        for leg in pending["settlement_legs"]
    ]


def test_funding_and_acceptance_require_exact_value_and_role(core):
    c, m, vm = core
    c.create_terms("work-1", json.dumps(terms()))
    deal = json.loads(c.get_terms("work-1"))
    vm.value = 19
    with pytest.raises(m.gl.vm.UserError, match="EXACT_FEE_FUNDING"):
        c.fund_terms("work-1", deal["terms_hash"])
    vm.value = 20
    c.fund_terms("work-1", deal["terms_hash"])
    vm.value = 0
    with pytest.raises(m.gl.vm.UserError, match="WORKER_ONLY"):
        c.accept_work("work-1", deal["terms_hash"])


def test_acceptance_timeout_refunds_only_value_actually_funded(core):
    c, m, vm = core
    vm.warp("2026-09-12T00:00:00+00:00")
    m.gl.message.raw["datetime"] = "2026-09-12T00:00:00+00:00"
    c.create_terms("work-1", json.dumps(terms()))
    deal = json.loads(c.get_terms("work-1"))
    vm.value = 20
    c.fund_terms("work-1", deal["terms_hash"])
    vm.sender = m.Address("0x" + "22" * 20).as_bytes
    vm.value = 5
    c.accept_work("work-1", deal["terms_hash"])
    vm.value = 0
    with pytest.raises(m.gl.vm.UserError, match="DEADLINE_NOT_REACHED"):
        c.advance_timeout("work-1")
    deadline = json.loads(c.get_terms("work-1"))["accept_deadline"]
    iso = datetime.fromtimestamp(deadline, timezone.utc).isoformat()
    vm.warp(iso)
    m.gl.message.raw["datetime"] = iso
    c.advance_timeout("work-1")
    timed_out = json.loads(c.get_terms("work-1"))
    assert timed_out["status"] == "SETTLEMENT_PENDING"
    assert timed_out["ledger"]["received"] == "25"
    assert sum(int(leg["amount"]) for leg in timed_out["settlement_legs"]) == 25
    assert {leg["kind"] for leg in timed_out["settlement_legs"]} == {"REFUND", "BOND_RETURN"}
    assert timed_out["report"]["decision"]["stages"]["B"]["entitlements"]["BOND_RETURN"] == "0"
    assert len(timed_out["report"]["obligation_assessments"]) == len(timed_out["manifest"]["obligations"])


def test_delivery_timeout_is_contract_determined_and_conserves_funds(core):
    c, m, vm = core
    vm.warp("2026-09-12T00:00:00+00:00")
    m.gl.message.raw["datetime"] = "2026-09-12T00:00:00+00:00"
    c.create_terms("work-1", json.dumps(terms()))
    deal = json.loads(c.get_terms("work-1"))
    vm.value = 20
    c.fund_terms("work-1", deal["terms_hash"])
    for worker in ("0x" + "22" * 20, "0x" + "33" * 20):
        vm.sender = m.Address(worker).as_bytes
        vm.value = 5
        c.accept_work("work-1", deal["terms_hash"])
    vm.value = 0
    active = json.loads(c.get_terms("work-1"))
    iso = datetime.fromtimestamp(active["a_deadline"], timezone.utc).isoformat()
    vm.warp(iso)
    m.gl.message.raw["datetime"] = iso
    c.advance_timeout("work-1")
    timed_out = json.loads(c.get_terms("work-1"))
    assert timed_out["report"]["decision"]["stages"]["A"]["outcome"] == "VIOLATED"
    assert timed_out["report"]["decision"]["stages"]["B"]["outcome"] == "UNASSESSABLE"
    assert sum(int(leg["amount"]) for leg in timed_out["settlement_legs"]) == 30
    assert any(row["obligation_id"] == "SYS_DELIVERY_A" and row["status"] == "VIOLATED" for row in timed_out["report"]["obligation_assessments"])


@pytest.mark.parametrize("revision", [1, -1, True, "0"])
def test_revisions_rejected(core, revision):
    _, m, _ = core
    value = terms()
    value["max_revisions"] = revision
    with pytest.raises(m.gl.vm.UserError, match="REVISIONS_DISABLED"):
        m._terms(json.dumps(value))


@pytest.mark.parametrize("amount", [True, 1, "01", "-1", "1.0", "1e2", str(100 * 10**18 + 1)])
def test_money_never_coerces(core, amount):
    _, m, _ = core
    value = terms()
    value["money"]["A"]["fee"] = amount
    with pytest.raises(m.gl.vm.UserError, match="AMOUNT"):
        m._terms(json.dumps(value))


@pytest.mark.parametrize("host", ["api.github.com.evil.test", "evil-api.github.com", "api.github.com@evil.test", "API.GITHUB.COM", "api.github.com:443", "api.github.com.", "127.0.0.1"])
def test_canonical_host_rejects_confusion(core, host):
    _, m, _ = core
    value = origin()
    value["hostname"] = host
    with pytest.raises(m.gl.vm.UserError, match="ORIGIN_HOST"):
        m._origin(value)


@pytest.mark.parametrize("path", ["../policy.txt", "/policy.txt", "a/../policy.txt", "a//policy.txt", "a/%2e%2e/policy.txt", "a\\policy.txt", "policy.txt?x=1", "policy.txt#x", "a/b/c/d/policy.txt"])
def test_artifact_paths_are_not_urls(core, path):
    _, m, _ = core
    value = artifact()
    value["path"] = path
    with pytest.raises(m.gl.vm.UserError):
        m._commitment(value, origin())


@pytest.mark.parametrize("field,value", [("commit", "main"), ("commit", "a" * 7), ("blob", "b" * 39), ("sha256", "c" * 63), ("encoding", "latin1"), ("content_type", "text/html"), ("byte_length", True), ("byte_length", 4097)])
def test_commitment_rejects_invalid_fields(core, field, value):
    _, m, _ = core
    item = artifact()
    item[field] = value
    with pytest.raises(m.gl.vm.UserError):
        m._commitment(item, origin())


@pytest.mark.parametrize("field,value", [("owner", "attacker"), ("owner_id", 99), ("repository", "other"), ("repository_id", 99)])
def test_committed_origin_cannot_change(core, field, value):
    _, m, _ = core
    item = artifact()
    item["origin"][field] = value
    with pytest.raises(m.gl.vm.UserError, match="ORIGIN_MISMATCH"):
        m._commitment(item, origin())


def test_tail_change_and_prefix_only_hash_rejected(core):
    _, m, _ = core
    head = b"Approval is required.\n"
    full = head + b"Exception: approval is NOT required for trials."
    assert m._artifact_bytes(artifact(full), full).encode() == full
    bad = artifact(full)
    bad["sha256"] = hashlib.sha256(head).hexdigest()
    with pytest.raises(m.gl.vm.UserError, match="ARTIFACT_HASH_MISMATCH"):
        m._artifact_bytes(bad, full)
    with pytest.raises(m.gl.vm.UserError):
        m._artifact_bytes(artifact(full), head)


@pytest.mark.parametrize("raw", [b"", b"\xff", b"\xef\xbb\xbfhello", b"hello\x00", b"x" * 4097, b"version https://git-lfs.github.com/spec/v1\noid sha256:a"])
def test_invalid_complete_bytes_rejected(core, raw):
    _, m, _ = core
    with pytest.raises(m.gl.vm.UserError):
        m._artifact_bytes(artifact(raw), raw)


@pytest.mark.parametrize("raw", ['{"x":1,"x":2}', '{"x":NaN}', '{"x":Infinity}', '{"x":1} trailing'])
def test_strict_json_no_ambiguous_keys_or_numbers(core, raw):
    _, m, _ = core
    with pytest.raises(m.gl.vm.UserError):
        m._artifact_bytes(artifact(raw.encode(), "application/json"), raw.encode())


def test_citations_use_full_utf8_byte_offsets(core):
    _, m, _ = core
    raw = "Điều kiện: cần phê duyệt.".encode()
    obligations, artifacts, response = candidate(m, raw)
    parsed = m._candidate(json.dumps(response), obligations, artifacts)
    quote = parsed["assessments"][0]["citations"][0]
    assert quote["start_byte"] == 0 and quote["end_byte"] == len(raw)


@pytest.mark.parametrize("mode", ["missing", "duplicate", "extra"])
def test_semantic_ids_exact(core, mode):
    _, m, _ = core
    obligations, artifacts, response = candidate(m)
    if mode == "missing":
        response["assessments"].pop()
    elif mode == "duplicate":
        response["assessments"][1] = copy.deepcopy(response["assessments"][0])
    else:
        response["assessments"][1]["obligation_id"] = "SEM_INVENTED"
    with pytest.raises(m.gl.vm.UserError):
        m._candidate(json.dumps(response), obligations, artifacts)


def test_complete_report_cannot_omit_deterministic_duties(core):
    _, m, _ = core
    obligations, _, response = candidate(m)
    with pytest.raises(m.gl.vm.UserError, match="ID_COUNT"):
        m._exact_report_ids(response["assessments"], obligations)


def complete_report(m, semantic_statuses=None):
    obligations, artifacts, semantic = candidate(m)
    for role, item in artifacts.items():
        commitment = item["commitment"]
        item["provenance"] = {"adapter": "github-commit-v1", "provider": commitment["origin"]["provider"], "hostname": commitment["origin"]["hostname"], "owner": commitment["origin"]["owner"], "owner_id": commitment["origin"]["owner_id"], "repository": commitment["origin"]["repository"], "repository_id": commitment["origin"]["repository_id"], "commit": commitment["commit"], "blob": commitment["blob"], "path": commitment["path"], "content_type": commitment["content_type"], "byte_length": commitment["byte_length"], "sha256": commitment["sha256"], "status": "VERIFIED"}
    semantic_statuses = semantic_statuses or {}
    for row in semantic["assessments"]:
        if row["obligation_id"] in semantic_statuses:
            row["status"] = semantic_statuses[row["obligation_id"]]
    deterministic = [{"obligation_id": row["id"], "status": "SATISFIED", "applicable": True, "reason": "Verified from frozen contract state."} for row in obligations if row["kind"] == "DETERMINISTIC"]
    identity = {"chain_domain": "1", "contract": "0x" + "44" * 20, "job_id": "work-1", "review_id": "review-1", "revision": 0, "terms_hash": "a" * 64, "evidence_manifest_hash": "b" * 64, "reviewed_at": "2026-09-11T00:00:00Z"}
    return obligations, artifacts, semantic, deterministic, identity


def test_ic_assembles_complete_structured_report_and_decision(core):
    _, m, _ = core
    obligations, artifacts, semantic, deterministic, identity = complete_report(m)
    report = m._assemble_report(identity, obligations, artifacts, semantic, deterministic, terms()["money"])
    assert set(report) == {"schema_version", *identity, "source_assessments", "obligation_assessments", "findings", "reasoning", "evidence_citations", "missing_items", "score", "decision"}
    assert len(report["source_assessments"]) == 3
    assert {row["obligation_id"] for row in report["obligation_assessments"]} == {row["id"] for row in obligations}
    assert report["score"] == {"A": 10000, "B": 10000}
    assert report["decision"]["next_state"] == "READY_FOR_SETTLEMENT"
    assert report["decision"]["stages"]["A"]["entitlements"] == {"PAYOUT": "10", "REFUND": "0", "BOND_RETURN": "5"}


@pytest.mark.parametrize("mode", ["missing", "duplicate", "extra"])
def test_structured_report_rejects_nonexact_deterministic_obligations(core, mode):
    _, m, _ = core
    obligations, artifacts, semantic, deterministic, identity = complete_report(m)
    if mode == "missing":
        deterministic.pop()
    elif mode == "duplicate":
        deterministic[-1] = copy.deepcopy(deterministic[0])
    else:
        deterministic[-1]["obligation_id"] = "SYS_INVENTED"
    with pytest.raises(m.gl.vm.UserError):
        m._assemble_report(identity, obligations, artifacts, semantic, deterministic, terms()["money"])


def test_ic_derives_violation_and_neutral_unwind_without_llm_money(core):
    _, m, _ = core
    obligations, artifacts, semantic, deterministic, identity = complete_report(m, {"SEM_A_MEANING": "VIOLATED", "SEM_B_FAITHFULNESS": "UNASSESSABLE"})
    for row in semantic["assessments"]:
        if row["status"] == "UNASSESSABLE":
            row["missing_evidence_ids"] = ["A"]
            row["citations"] = [citation for citation in row["citations"] if citation["artifact_id"] != "A"]
    report = m._assemble_report(identity, obligations, artifacts, semantic, deterministic, terms()["money"])
    assert report["score"] == {"A": 0, "B": None}
    assert report["decision"]["next_state"] == "NEUTRAL_UNWIND_REQUIRED"
    assert report["decision"]["stages"]["A"]["entitlements"] == {"PAYOUT": "0", "REFUND": "13", "BOND_RETURN": "2"}
    assert report["decision"]["stages"]["B"]["entitlements"] == {"PAYOUT": "0", "REFUND": "10", "BOND_RETURN": "5"}
    assert [item["obligation_id"] for item in report["findings"]] == ["SEM_A_MEANING"]
    assert report["missing_items"] == [{"obligation_id": "SEM_B_FAITHFULNESS", "evidence_id": "A", "reason_code": "SEMANTIC_EVIDENCE_INSUFFICIENT"}]


def test_report_refuses_hash_valid_bytes_without_verified_provenance(core):
    _, m, _ = core
    obligations, artifacts, semantic, deterministic, identity = complete_report(m)
    artifacts["B"].pop("provenance")
    with pytest.raises(m.gl.vm.UserError, match="PROVENANCE_ASSESSMENT_SCHEMA"):
        m._assemble_report(identity, obligations, artifacts, semantic, deterministic, terms()["money"])


def test_report_refuses_mismatched_provenance_assessment(core):
    _, m, _ = core
    obligations, artifacts, semantic, deterministic, identity = complete_report(m)
    artifacts["A"]["provenance"]["repository_id"] = 999
    with pytest.raises(m.gl.vm.UserError, match="PROVENANCE_ASSESSMENT_MISMATCH"):
        m._assemble_report(identity, obligations, artifacts, semantic, deterministic, terms()["money"])


@pytest.mark.parametrize("obligation_id,stage", [("SYS_DELIVERY_A", "A"), ("SYS_UPSTREAM_B", "B"), ("SYS_PROVENANCE_SOURCE", "both")])
def test_deterministic_duty_changes_only_its_contract_derived_stage(core, obligation_id, stage):
    _, m, _ = core
    obligations, artifacts, semantic, deterministic, identity = complete_report(m)
    next(row for row in deterministic if row["obligation_id"] == obligation_id)["status"] = "VIOLATED"
    report = m._assemble_report(identity, obligations, artifacts, semantic, deterministic, terms()["money"])
    expected = {"A", "B"} if stage == "both" else {stage}
    assert {name for name, row in report["decision"]["stages"].items() if row["outcome"] == "VIOLATED"} == expected


@pytest.mark.parametrize("mode", ["missing_artifact", "partial_chunks", "wrong_hash", "false_quote", "extra_money"])
def test_candidate_rejects_incomplete_or_injected_output(core, mode):
    _, m, _ = core
    obligations, artifacts, response = candidate(m)
    if mode == "missing_artifact":
        response["reviewed_artifacts"].pop()
    elif mode == "partial_chunks":
        response["reviewed_chunks"] = ["SOURCE:0"]
    elif mode == "wrong_hash":
        response["reviewed_artifacts"][0]["sha256"] = "f" * 64
    elif mode == "false_quote":
        response["assessments"][0]["citations"][0]["quote"] = "Approval never needed."
    else:
        response["amount"] = "999"
    with pytest.raises(m.gl.vm.UserError):
        m._candidate(json.dumps(response), obligations, artifacts)


@pytest.mark.parametrize("field,value", [("deal_id", "other"), ("source_contract", "0x" + "44" * 20), ("router", "0x" + "44" * 20), ("recipient", "0x" + "44" * 20), ("amount", "16"), ("kind", "REFUND"), ("state", "FUNDED"), ("chain_id", 1), ("role", "B"), ("sequence", 1), ("sequence", False), ("receipt_id", "f" * 64), ("terms_hash", "f" * 64), ("decision_hash", "f" * 64)])
def test_exact_receipt_identity(core, field, value):
    _, m, _ = core
    expected = receipt(m)
    actual = {**expected, field: value}
    assert m._receipt_matches(expected, expected)
    with pytest.raises(m.gl.vm.UserError):
        m._receipt_matches(expected, actual)


def test_legacy_receipt_identity_remains_stable_but_router_is_disabled(core):
    _, m, _ = core
    expected = receipt(m)
    assert m._receipt_digest(expected) == "bd0182020972ca9aaa828f784ac07f358885dadeb9b050d8ef72834e1e8ef8c8"
    with pytest.raises(m.gl.vm.UserError, match="STUDIO_NEXT_EVM_RECEIPTS_UNAVAILABLE"):
        m._router_fund_calldata({**expected, "state": "FUNDED"})


@pytest.mark.parametrize("outcome,expected", [("SATISFIED", (10, 0, 5)), ("VIOLATED", (0, 13, 2)), ("UNASSESSABLE", (0, 10, 5))])
def test_fixed_entitlements_conserve_and_do_not_net_receipt_kinds(core, outcome, expected):
    _, m, _ = core
    legs = m._entitlements(terms()["money"]["A"], outcome)
    assert tuple(int(legs[k]) for k in ("PAYOUT", "REFUND", "BOND_RETURN")) == expected
    assert sum(map(int, legs.values())) == 15


def test_refund_can_include_max_fee_and_penalty(core):
    _, m, _ = core
    money = {k: str(m.MAX_AMOUNT) for k in ("fee", "bond", "penalty")}
    refund = m._entitlements(money, "VIOLATED")["REFUND"]
    expected = {**receipt(m), "kind": "REFUND", "amount": refund}
    assert refund == str(2 * m.MAX_AMOUNT)
    assert m._receipt_matches(expected, expected)


def test_validator_independently_acquires_and_sees_complete_tail(core, monkeypatch):
    _, m, _ = core
    raw = b"General rule: approval required.\nFinal exception: trials need no approval."
    obligations, artifacts, response = candidate(m, raw)
    fetches, prompts = [], []
    def acquire():
        fetches.append(1)
        return copy.deepcopy(artifacts)
    def prompt(text, **kwargs):
        prompts.append(text)
        return {"supported": True} if "VERISTEP_V2_GROUNDING" in text else copy.deepcopy(response)
    monkeypatch.setattr(m.gl.nondet, "exec_prompt", prompt)
    leader = m._wire_candidate(m._derive_semantics(obligations, acquire()))
    assert m._validate_semantic_leader(obligations, acquire, m.gl.vm.Return(leader))
    assert len(fetches) == 2 and len(prompts) == 3
    assert all("Final exception: trials need no approval." in p for p in prompts)
    assert "proposed" not in prompts[1]


def test_semantic_prompt_retries_only_malformed_output_with_same_full_evidence(core, monkeypatch):
    _, m, _ = core
    raw = b"Opening rule: approval required.\nFinal exception: trials need no approval."
    obligations, artifacts, response = candidate(m, raw)
    prompts = []

    def prompt(text, **kwargs):
        prompts.append(text)
        return {} if len(prompts) == 1 else copy.deepcopy(response)

    monkeypatch.setattr(m.gl.nondet, "exec_prompt", prompt)
    result = m._derive_semantics(obligations, artifacts)
    assert result["assessments"][0]["status"] == "SATISFIED"
    assert len(prompts) == 2
    assert all("Final exception: trials need no approval." in text for text in prompts)
    assert "FORMAT_RETRY:" not in prompts[0] and "FORMAT_RETRY:" in prompts[1]

    skeleton = json.loads(prompts[0].split("OUTPUT_SKELETON_JSON\n", 1)[1].split("\nBEGIN_UNTRUSTED_INPUT_JSON", 1)[0])
    assert skeleton["reviewed_artifacts"] == response["reviewed_artifacts"]
    assert [row["obligation_id"] for row in skeleton["assessments"]] == [
        row["id"] for row in obligations if row["kind"] == "SEMANTIC"
    ]
    assert all(row["status"] == "CHOOSE_STATUS" for row in skeleton["assessments"])
    assert all({citation["artifact_id"] for citation in row["citations"]} == set(obligation["evidence_ids"])
               for row, obligation in zip(skeleton["assessments"], [r for r in obligations if r["kind"] == "SEMANTIC"]))


def test_semantic_prompt_never_rerolls_valid_first_result(core, monkeypatch):
    _, m, _ = core
    obligations, artifacts, response = candidate(m)
    calls = []

    def prompt(text, **kwargs):
        calls.append(text)
        return copy.deepcopy(response)

    monkeypatch.setattr(m.gl.nondet, "exec_prompt", prompt)
    assert m._derive_semantics(obligations, artifacts)["assessments"][0]["status"] == "SATISFIED"
    assert len(calls) == 1


def test_semantic_prompt_fails_closed_after_one_format_retry(core, monkeypatch):
    _, m, _ = core
    obligations, artifacts, _ = candidate(m)
    calls = []

    def prompt(text, **kwargs):
        calls.append(text)
        return {}

    monkeypatch.setattr(m.gl.nondet, "exec_prompt", prompt)
    with pytest.raises(m.gl.vm.UserError, match="CANDIDATE_SCHEMA"):
        m._derive_semantics(obligations, artifacts)
    assert len(calls) == 2


def test_validator_retries_only_malformed_grounding_schema(core, monkeypatch):
    _, m, _ = core
    obligations, artifacts, response = candidate(m)
    grounding_calls = []

    def prompt(text, **kwargs):
        if "VERISTEP_V2_GROUNDING" not in text:
            return copy.deepcopy(response)
        grounding_calls.append(text)
        return {} if len(grounding_calls) == 1 else {"supported": True}

    monkeypatch.setattr(m.gl.nondet, "exec_prompt", prompt)
    assert m._validate_semantic_leader(obligations, lambda: artifacts, m.gl.vm.Return(response))
    assert len(grounding_calls) == 2
    assert "FORMAT_RETRY:" not in grounding_calls[0] and "FORMAT_RETRY:" in grounding_calls[1]
    assert all("Approval is required." in text for text in grounding_calls)


def test_validator_never_rerolls_valid_grounding_rejection(core, monkeypatch):
    _, m, _ = core
    obligations, artifacts, response = candidate(m)
    grounding_calls = []

    def prompt(text, **kwargs):
        if "VERISTEP_V2_GROUNDING" not in text:
            return copy.deepcopy(response)
        grounding_calls.append(text)
        return {"supported": False}

    monkeypatch.setattr(m.gl.nondet, "exec_prompt", prompt)
    assert not m._validate_semantic_leader(obligations, lambda: artifacts, m.gl.vm.Return(response))
    assert len(grounding_calls) == 1


@pytest.mark.parametrize("mode", ["outcome", "grounding", "evidence_changed", "malformed", "grounding_truthy"])
def test_validator_rejects_substantive_or_structural_disagreement(core, monkeypatch, mode):
    c, m, _ = core
    obligations, artifacts, response = candidate(m)
    c.create_terms("protected", json.dumps(terms()))
    before = c.get_terms("protected")
    independent = copy.deepcopy(response)
    leader = copy.deepcopy(response)
    if mode == "outcome":
        leader["assessments"][0]["status"] = "VIOLATED"
    if mode == "malformed":
        leader["assessments"].pop()
    if mode == "evidence_changed":
        _, artifacts, independent = candidate(m, b"Approval is never required.")
    def prompt(text, **kwargs):
        if "VERISTEP_V2_GROUNDING" in text:
            return {"supported": "true" if mode == "grounding_truthy" else mode != "grounding"}
        return independent
    monkeypatch.setattr(m.gl.nondet, "exec_prompt", prompt)
    assert not m._validate_semantic_leader(obligations, lambda: artifacts, m.gl.vm.Return(leader))
    assert c.get_terms("protected") == before


def test_candidate_rejects_ambiguous_repeated_quote(core):
    _, m, _ = core
    obligations, artifacts, response = candidate(m, b"Approval required. Approval required.")
    response["assessments"][0]["citations"][0]["quote"] = "Approval required."
    with pytest.raises(m.gl.vm.UserError, match="CITATION_NOT_UNIQUE"):
        m._candidate(json.dumps(response), obligations, artifacts)


def test_unassessable_candidate_can_name_all_missing_evidence_without_fake_citations(core):
    _, m, _ = core
    obligations, artifacts, response = candidate(m)
    first = response["assessments"][0]
    duty = next(row for row in obligations if row["id"] == first["obligation_id"])
    first.update(status="UNASSESSABLE", reason="Required evidence is unavailable.", citations=[], missing_evidence_ids=duty["evidence_ids"])
    normalized = m._candidate(json.dumps(response), obligations, artifacts)
    assert normalized["assessments"][0]["missing_evidence_ids"] == sorted(duty["evidence_ids"])


def test_sdk_nondet_receives_both_callbacks_without_backend_authority(core, monkeypatch):
    _, m, _ = core
    obligations, artifacts, response = candidate(m)
    for item in artifacts.values():
        commitment = item["commitment"]
        item["provenance"] = {"adapter": "github-commit-v1", "provider": commitment["origin"]["provider"], "hostname": commitment["origin"]["hostname"], "owner": commitment["origin"]["owner"], "owner_id": commitment["origin"]["owner_id"], "repository": commitment["origin"]["repository"], "repository_id": commitment["origin"]["repository_id"], "commit": commitment["commit"], "blob": commitment["blob"], "path": commitment["path"], "content_type": commitment["content_type"], "byte_length": commitment["byte_length"], "sha256": commitment["sha256"], "status": "VERIFIED"}
    fetched = []
    def acquire(_commitments):
        fetched.append(1)
        return artifacts
    def prompt(text, **kwargs):
        return {"supported": True} if "VERISTEP_V2_GROUNDING" in text else response
    def exercise_callbacks(leader, validator):
        value = leader()
        assert validator(m.gl.vm.Return(value))
        return value
    monkeypatch.setattr(m.gl.nondet, "exec_prompt", prompt)
    monkeypatch.setattr(m, "_acquire_all", acquire)
    monkeypatch.setattr(m.gl.vm, "run_nondet", exercise_callbacks)
    result = m._review_consensus(obligations, {role: artifacts[role]["commitment"] for role in m.ROLES})
    assert result["semantic"] == response
    assert set(result["artifacts"]) == set(m.ROLES)
    assert len(fetched) == 2


def test_v06_does_not_fall_back_to_legacy_evm_receipts(core):
    _, m, _ = core
    with pytest.raises(m.gl.vm.UserError, match="STUDIO_NEXT_EVM_RECEIPTS_UNAVAILABLE"):
        m._evm_read_exact(m.Address("0x" + "44" * 20), b"abcd")
    with pytest.raises(m.gl.vm.UserError, match="STUDIO_NEXT_EVM_SEND_UNAVAILABLE"):
        m._evm_send_exact(m.Address("0x" + "44" * 20), b"abcd", 123)


def test_native_receipt_confirmation_fails_closed(core):
    _, m, _ = core
    with pytest.raises(m.gl.vm.UserError, match="STUDIO_NEXT_NATIVE_RECEIPT_UNVERIFIED"):
        m._router_receipt_digest(
            m.Address("0x" + "44" * 20),
            "0x" + "55" * 20,
            "66" * 32,
        )


def github_bundle():
    raw = b"Approval is required.\nException: trials require no approval."
    commitment = artifact(raw)
    commitment["path"] = "docs/policy.txt"
    commitment["blob"] = hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\x00" + raw).hexdigest()
    repo = {"id": 2, "name": "policy", "full_name": "example/policy", "owner": {"id": 1, "login": "example"}, "private": False}
    commit = {"sha": commitment["commit"], "tree": {"sha": "c" * 40}}
    trees = [{"sha": "c" * 40, "truncated": False, "tree": [{"path": "docs", "type": "tree", "mode": "040000", "sha": "d" * 40}]}, {"sha": "d" * 40, "truncated": False, "tree": [{"path": "policy.txt", "type": "blob", "mode": "100644", "sha": commitment["blob"], "size": len(raw)}]}]
    blob = {"sha": commitment["blob"], "encoding": "base64", "size": len(raw), "content": base64.b64encode(raw).decode() + "\n"}
    return commitment, repo, commit, trees, blob


def test_github_tree_to_blob_binds_full_bytes(core):
    _, m, _ = core
    data = github_bundle()
    raw = m._github_bundle(*data)
    assert raw.endswith(b"Exception: trials require no approval.")
    assert hashlib.sha256(raw).hexdigest() == data[0]["sha256"]


@pytest.mark.parametrize("mode", ["owner", "owner_id", "repository", "repository_id", "commit", "root_tree", "subtree", "missing_tree", "extra_tree", "truncated", "duplicate_path", "symlink", "submodule", "executable", "blob_id", "size", "base64", "tail", "private"])
def test_github_provenance_components_fail_closed(core, mode):
    _, m, _ = core
    commitment, repo, commit, trees, blob = github_bundle()
    if mode == "owner": repo["owner"]["login"] = "attacker"
    elif mode == "owner_id": repo["owner"]["id"] = 9
    elif mode == "repository": repo["name"] = "other"
    elif mode == "repository_id": repo["id"] = 9
    elif mode == "commit": commit["sha"] = "e" * 40
    elif mode == "root_tree": trees[0]["sha"] = "e" * 40
    elif mode == "subtree": trees[1]["sha"] = "e" * 40
    elif mode == "missing_tree": trees.pop()
    elif mode == "extra_tree": trees.append(copy.deepcopy(trees[-1]))
    elif mode == "truncated": trees[1]["truncated"] = True
    elif mode == "duplicate_path": trees[1]["tree"].append(copy.deepcopy(trees[1]["tree"][0]))
    elif mode == "symlink": trees[1]["tree"][0]["mode"] = "120000"
    elif mode == "submodule": trees[0]["tree"][0].update(mode="160000", type="commit")
    elif mode == "executable": trees[1]["tree"][0]["mode"] = "100755"
    elif mode == "blob_id": blob["sha"] = "e" * 40
    elif mode == "size": blob["size"] += 1
    elif mode == "base64": blob["content"] = "%%%%"
    elif mode == "tail":
        raw = base64.b64decode(blob["content"])
        blob["content"] = base64.b64encode(raw[:-1] + b"!").decode()
    elif mode == "private": repo["private"] = True
    with pytest.raises(m.gl.vm.UserError):
        m._github_bundle(commitment, repo, commit, trees, blob)


@pytest.mark.parametrize("status", [301, 302, 303, 307, 308, 403, 404, 429, 500, True])
def test_http_non_success_is_never_evidence(core, status):
    _, m, _ = core
    with pytest.raises(m.gl.vm.UserError):
        m._provider_json(status, {"content-type": b"application/json"}, b'{"ok":true}')


@pytest.mark.parametrize("headers,body", [({"content-type": b"text/html"}, b"{}"), ({"content-type": b"application/json", "Content-Type": b"text/html"}, b"{}"), ({"content-type": b"application/json"}, b"x" * 65537), ({"content-type": b"application/json"}, b'{} false'), ({"content-type": b"application/json"}, b'{"x":1,"x":2}'), ({"content-type": b"application/json"}, b'\xff'), ({"content-type": b"application/json"}, b'[]')], ids=["html", "duplicate-header", "oversized", "trailing-data", "duplicate-json-key", "utf8", "array"])
def test_http_envelope_rejects_ambiguous_or_truncated_content(core, headers, body):
    _, m, _ = core
    with pytest.raises(m.gl.vm.UserError):
        m._provider_json(200, headers, body)


def test_http_envelope_preserves_complete_json(core):
    _, m, _ = core
    assert m._provider_json(200, {"Content-Type": b"application/json; charset=utf-8"}, b'{"first":1,"last":"exception"}') == {"first": 1, "last": "exception"}


def test_github_acquisition_constructs_canonical_urls_and_caches_identical_objects(core, monkeypatch):
    _, m, _ = core
    commitment, repo, commit, trees, blob = github_bundle()
    base = "https://api.github.com/repos/example/policy"
    payloads = {
        base: repo,
        base + "/git/commits/" + commitment["commit"]: commit,
        base + "/git/trees/" + trees[0]["sha"]: trees[0],
        base + "/git/trees/" + trees[1]["sha"]: trees[1],
        base + "/git/blobs/" + commitment["blob"]: blob,
    }
    calls = []

    def get(url, **kwargs):
        calls.append((url, kwargs))
        body = json.dumps(payloads[url], separators=(",", ":")).encode()
        return SimpleNamespace(status=200, headers={"content-type": b"application/vnd.github+json; charset=utf-8"}, body=body)

    monkeypatch.setattr(m.gl.nondet.web, "get", get)
    acquired = m._acquire_all({role: copy.deepcopy(commitment) for role in m.ROLES})
    assert len(calls) == len(payloads)
    assert set(url for url, _ in calls) == set(payloads)
    assert all(url.startswith(base) and "?" not in url and "#" not in url for url, _ in calls)
    assert all(call[1]["headers"]["Accept"] == "application/vnd.github+json" for call in calls)
    assert all(acquired[role]["bytes"].endswith(b"trials require no approval.") for role in m.ROLES)
    assert all(acquired[role]["provenance"]["status"] == "VERIFIED" for role in m.ROLES)


def test_github_acquisition_rejects_surfaced_cross_domain_redirect_before_body_use(core, monkeypatch):
    _, m, _ = core
    commitment, *_ = github_bundle()
    calls = []

    def get(url, **kwargs):
        calls.append(url)
        return SimpleNamespace(status=302, headers={"location": b"https://evil.example/forged.json", "content-type": b"application/json"}, body=b'{"forged":true}')

    monkeypatch.setattr(m.gl.nondet.web, "get", get)
    with pytest.raises(m.gl.vm.UserError, match="HTTP_REDIRECT"):
        m._acquire_github(commitment, {})
    assert calls == ["https://api.github.com/repos/example/policy"]
