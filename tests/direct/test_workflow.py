import json
import pytest


def test_config_and_empty_list(system):
    assert json.loads(system.c.get_config())["version"] == "veristep-1.1"
    assert json.loads(system.c.list_jobs(0, 20)) == {"total": 0, "ids": []}


def test_funding_acceptance_and_immutable_handoffs(system):
    job = system.create()
    assert job["ledger"]["received"] == "30"
    assert job["status"] == "FUNDED"
    system.accept("A")
    assert system.job()["status"] == "FUNDED"
    system.accept("B")
    assert system.job()["status"] == "ACTIVE"
    system.submit("A")
    original = system.job()["artifacts"]["A"]
    with system.vm.expect_revert("Not this stage"):
        system.c.submit_work("demo-job", "changed", original["upstream"])
    system.submit("B")
    assert system.job()["artifacts"]["B"]["upstream"] == original["submission_id"]
    assert system.job()["ledger"]["received"] == "42"


@pytest.mark.parametrize("a,b,credits", [
    ("SATISFIED", "SATISFIED", {"CLIENT": "0", "A": "15", "B": "27"}),
    ("VIOLATED", "SATISFIED", {"CLIENT": "13", "A": "2", "B": "27"}),
    ("SATISFIED", "VIOLATED", {"CLIENT": "24", "A": "15", "B": "3"}),
    ("VIOLATED", "VIOLATED", {"CLIENT": "37", "A": "2", "B": "3"}),
])
def test_fixed_settlement_matrix(system, a, b, credits):
    system.ready()
    job = system.resolve(a, b)
    assert job["status"] == "RESOLVED"
    assert job["outcomes"] == {"A": a, "B": b}
    assert job["ledger"]["credits"] == credits
    assert sum(map(int, credits.values())) == int(job["ledger"]["received"])
    with system.vm.expect_revert("Adjudication window closed"):
        system.c.resolve_review("demo-job")
    with system.vm.expect_revert("Work not approvable"):
        system.c.approve_work("demo-job")


def test_inconclusive_waits_and_never_penalizes_unknown_stage(system):
    system.ready()
    job = system.resolve("UNASSESSABLE", "SATISFIED")
    assert job["status"] == "INCONCLUSIVE"
    assert job["ledger"]["issued"] == "0"
    with system.vm.expect_revert("Deadline not reached"):
        system.c.advance_timeout("demo-job")
    system.now(job["adjudication_deadline"])
    system.c.advance_timeout("demo-job")
    assert system.job()["ledger"]["credits"] == {"CLIENT": "10", "A": "5", "B": "27"}


@pytest.mark.parametrize("accepted", [[], ["A"], ["B"]])
def test_cancellation_refunds_actual_deposits_only(system, accepted):
    system.create()
    for role in accepted:
        system.accept(role)
    system.sender(system.client)
    system.c.cancel_job("demo-job")
    job = system.job()
    assert job["status"] == "CANCELLED"
    assert job["ledger"]["credits"] == {"CLIENT": "30", "A": "5" if "A" in accepted else "0", "B": "7" if "B" in accepted else "0"}
    assert job["ledger"]["issued"] == job["ledger"]["received"]
    with system.vm.expect_revert("Cannot cancel active job"):
        system.c.cancel_job("demo-job")


def test_a_timeout_unwinds_unstarted_b(system):
    system.active()
    system.now(system.job()["a_deadline"])
    system.c.advance_timeout("demo-job")
    assert system.job()["ledger"]["credits"] == {"CLIENT": "33", "A": "2", "B": "7"}


def test_b_timeout_still_reviews_a(system):
    system.active()
    system.submit("A")
    system.now(system.job()["b_deadline"])
    system.c.advance_timeout("demo-job")
    assert system.job()["b_missing"] is True
    response = system.response()
    assert len(response["assessments"]) == 2
    system.vm.mock_llm("VERISTEP_REVIEW_V1", json.dumps(response))
    system.c.resolve_review("demo-job")
    assert system.job()["outcomes"] == {"A": "SATISFIED", "B": "VIOLATED"}


def test_undisputed_silence_is_not_a_stuck_job(system):
    system.ready()
    system.now(system.job()["review_deadline"])
    system.c.advance_timeout("demo-job")
    assert system.job()["settlement_reason"] == "UNDISPUTED_TIMEOUT"


def test_dispute_prevents_autoaccept_and_infrastructure_failure_unwinds(system):
    system.ready()
    system.sender(system.client)
    system.c.request_review("demo-job")
    job = system.job()
    system.vm.mock_llm("VERISTEP_REVIEW_V1", '{"garbage":true}')
    with system.vm.expect_revert("Invalid review schema"):
        system.c.resolve_review("demo-job")
    assert system.job()["status"] == "REVIEW_REQUESTED"
    system.now(job["adjudication_deadline"])
    system.c.advance_timeout("demo-job")
    assert system.job()["ledger"]["credits"] == {"CLIENT": "30", "A": "5", "B": "7"}
    assert system.job()["settlement_reason"] == "REVIEW_UNAVAILABLE"


def test_claim_idempotency_and_exact_recipient(system, monkeypatch):
    system.ready()
    system.resolve()
    emitted = []

    class Recipient:
        def __init__(self, address):
            self.address = str(address)
        def emit_transfer(self, *, value):
            emitted.append((self.address, int(value)))

    monkeypatch.setattr(system.m, "_Recipient", Recipient)
    system.sender(system.a)
    system.c.claim("demo-job")
    assert emitted == [(str(system.a), 15)]
    assert system.job()["claims"]["A"]["state"] == "MESSAGE_EMITTED"
    with system.vm.expect_revert("Nothing to claim"):
        system.c.claim("demo-job")
    assert len(emitted) == 1
    system.sender(system.b)
    system.c.claim("demo-job")
    assert system.job()["ledger"]["emitted"] == "42"
    assert sum(map(int, system.job()["ledger"]["credits"].values())) == 0
