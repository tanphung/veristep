import copy
import json
import sys
import os
from pathlib import Path
from datetime import datetime, timezone

import pytest


SOURCE = "Export requires approval. Trial accounts cannot export. Paid accounts may export after approval."
GOOD = "Trial accounts cannot export. Paid accounts may export only after approval."
BAD = "Trial accounts can export immediately. Paid accounts can export immediately."
TASK = "Explain whether trial and paid accounts can export, and whether approval is needed."


@pytest.fixture(autouse=True)
def windows_direct_stdin_compat(monkeypatch):
    """Bridge current gltest direct mode to the legacy V1 SDK on Windows.

    gltest RC2 imports only the current ``genlayer`` package layout, while the
    immutable V1 regression contract uses the v0.2 ``genlayer.py`` layout. Keep
    both suites runnable and defer WinError 32 stdin cleanup until VM teardown.
    No contract behavior or validator result is mocked by this adapter.
    """
    if os.name != "nt":
        yield
        return
    import gltest.direct.loader as loader
    import gltest.direct.vm as direct_vm_module
    import gltest.direct.wasi_mock as wasi_mock

    def sdk_types():
        try:
            from genlayer import types
        except ImportError:
            from genlayer.py import types
        return types

    def import_calldata():
        try:
            from genlayer import calldata
        except ImportError:
            from genlayer.py import calldata
        return calldata

    monkeypatch.setattr(loader, "import_calldata", import_calldata)
    monkeypatch.setattr(wasi_mock, "import_calldata", import_calldata)
    monkeypatch.setattr(loader, "import_address", lambda: sdk_types().Address)
    monkeypatch.setattr(loader, "import_lazy", lambda: sdk_types().Lazy)
    monkeypatch.setattr(
        direct_vm_module,
        "import_address_u256",
        lambda: (sdk_types().Address, sdk_types().u256),
    )

    original_refresh = direct_vm_module.VMContext._refresh_gl_message

    def refresh_message(vm):
        original_refresh(vm)
        legacy_gl = sys.modules.get("genlayer.gl")
        if legacy_gl is None or not hasattr(legacy_gl, "MessageType"):
            return

        Address, u256 = direct_vm_module.import_address_u256()

        def address(value):
            if value is None or isinstance(value, Address):
                return value
            if isinstance(value, bytes):
                return Address(value)
            if hasattr(value, "as_bytes"):
                return Address(value.as_bytes)
            return value

        updates = {
            "contract_address": address(vm._contract_address),
            "sender_address": address(vm.sender),
            "origin_address": address(vm.origin),
            "value": vm._value,
            "chain_id": vm._chain_id,
        }
        legacy_gl.message_raw.update(updates)
        legacy_gl.message = legacy_gl.MessageType(
            contract_address=updates["contract_address"],
            sender_address=updates["sender_address"],
            origin_address=updates["origin_address"],
            value=u256(updates["value"]),
            chain_id=u256(updates["chain_id"]),
        )

    monkeypatch.setattr(direct_vm_module.VMContext, "_refresh_gl_message", refresh_message)

    original_allocate = loader._allocate_contract

    def allocate_contract(contract_cls, vm, *args, **kwargs):
        """Allocate v0.2 storage with its own descriptor API, not v0.3's."""
        if "genlayer.py.storage" not in sys.modules:
            return original_allocate(contract_cls, vm, *args, **kwargs)

        from genlayer.py.storage import ROOT_SLOT_ID
        from genlayer.py.storage._internal.generate import (
            ORIGINAL_INIT_ATTR,
            _storage_build,
        )

        descriptor = _storage_build(contract_cls, {})
        instance = descriptor.get(vm._storage.get_store_slot(ROOT_SLOT_ID), 0)
        init = getattr(getattr(descriptor, "cls", None), "__init__", None)
        if init is None:
            init = getattr(contract_cls, "__init__", None)
        if init is not None:
            init = getattr(init, ORIGINAL_INIT_ATTR, init)
            init(instance, *args, **kwargs)
        return instance

    monkeypatch.setattr(loader, "_allocate_contract", allocate_contract)

    original = loader._inject_message_to_fd0
    pending = []
    def inject(vm):
        try:
            original(vm)
        except PermissionError as error:
            if error.winerror != 32 or not error.filename or vm._original_stdin_fd is None:
                raise
            pending.append(Path(error.filename))
    monkeypatch.setattr(loader, "_inject_message_to_fd0", inject)
    yield
    for path in pending:
        path.unlink(missing_ok=True)


@pytest.fixture
def system(direct_vm, direct_deploy, direct_alice, direct_bob, direct_charlie, direct_owner):
    direct_vm.warp("2026-09-05T12:00:00Z")
    direct_vm.sender = direct_alice
    contract = direct_deploy("contracts/veristep_v1.py", sdk_version="v0.2.12")
    module = sys.modules["_contract_veristep_v1"]

    def run_nondet_unsafe(leader_fn, validator_fn, /, **kwargs):
        direct_vm._in_nondet = True
        try:
            result = leader_fn()
        finally:
            direct_vm._in_nondet = False
        direct_vm._captured_validators.append((result, leader_fn, validator_fn))
        return result

    # gltest RC2 patches the v0.3 nondeterminism API only. V1 remains a legacy
    # regression target, so bind its equivalent call to the same direct VM.
    module.gl.vm.run_nondet_unsafe = run_nondet_unsafe

    class System:
        vm = direct_vm
        c = contract
        m = module
        client, a, b, outsider = [module.Address(x if isinstance(x, bytes) else x.as_bytes)
                                  for x in (direct_alice, direct_bob, direct_charlie, direct_owner)]

        def sender(self, address, value=0):
            self.vm.sender = address
            self.vm.value = value

        def now(self, timestamp):
            # gltest 0.29.2 warp refreshes MessageType but not message_raw datetime.
            # Supply the same chain timestamp explicitly for this documented harness gap.
            iso = datetime.fromtimestamp(timestamp, timezone.utc).isoformat()
            self.vm.warp(iso)
            self.m.gl.message_raw["datetime"] = iso

        def job(self, job_id="demo-job"):
            return json.loads(self.c.get_job(job_id))

        def create(self, job_id="demo-job", **changes):
            values = dict(job_id=job_id, title="Export policy report", task=TASK, source=SOURCE,
                          worker_a=self.a, worker_b=self.b, fee_a=10, fee_b=20, bond_a=5, bond_b=7,
                          penalty_a=3, penalty_b=4, accept_seconds=60, step_seconds=60,
                          review_seconds=60, adjudication_seconds=60, verify_source=False)
            values.update(changes)
            self.sender(self.client, values["fee_a"] + values["fee_b"])
            self.c.create_job(**values)
            self.vm.value = 0
            return self.job(job_id)

        def accept(self, role, job_id="demo-job"):
            job = self.job(job_id)
            self.sender(self.a if role == "A" else self.b, int(job["terms"]["money"][role]["bond"]))
            assert str(self.m.gl.message.sender_address) == job["workers"][role], (str(self.m.gl.message.sender_address), job["workers"][role])
            self.c.accept_job(job_id, job["terms_hash"])
            self.vm.value = 0

        def active(self, **changes):
            self.create(**changes)
            self.accept("A")
            self.accept("B")

        def submit(self, role, text=GOOD, job_id="demo-job"):
            self.sender(self.a if role == "A" else self.b)
            previous = "SOURCE" if role == "A" else "A"
            upstream = self.job(job_id)["artifacts"][previous]["submission_id"]
            self.c.submit_work(job_id, text, upstream)

        def ready(self, a_text=GOOD, b_text=GOOD, **changes):
            self.active(**changes)
            self.submit("A", a_text)
            self.submit("B", b_text)

        def snapshot(self):
            return json.loads(self.c.get_review_input("demo-job"))["snapshot"]

        def response(self, a="SATISFIED", b="SATISFIED"):
            snapshot = self.snapshot()
            chunks = self.m._verify_snapshot(snapshot)
            result = {"reviewed_chunks": [c["id"] for c in chunks], "assessments": []}
            for obligation in snapshot["obligations"]:
                cites = []
                for role in obligation["evidence_roles"]:
                    chunk = next(c for c in chunks if c["role"] == role)
                    # Fixtures are short ASCII here. Quote a complete supporting sentence.
                    quote = chunk["content"].split(".")[0] + "."
                    cites.append({"chunk_id": chunk["id"], "quote": quote})
                result["assessments"].append({"obligation_id": obligation["id"], "status": a if obligation["stage"] == "A" else b,
                                               "reason": "Controlled unit-test response; not an actual AI verdict.", "citations": cites})
            return result

        def resolve(self, a="SATISFIED", b="SATISFIED"):
            self.sender(self.client)
            self.c.request_review("demo-job")
            self.vm.mock_llm("VERISTEP_REVIEW_V1", json.dumps(self.response(a, b)))
            self.c.resolve_review("demo-job")
            return self.job()

    return System()
