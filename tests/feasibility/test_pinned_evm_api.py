"""Pinned SDK diagnostics, NOT network/EVM integration.

Exercise the official cached SDK through its public typed interface. Only the
host-call boundary is captured; the SDK proxy and ABI encoder are unmodified.
The high-level proxy is intentionally not the selected production path. These
tests lock its observed defects so a future runner change triggers re-review;
the selected WASI path has separate direct and real-GenVM probes.
"""

import importlib
import inspect

import pytest


@pytest.fixture
def pinned_sdk(system):
    # Existing fixture loads the exact v0.2.12 runner/header without chain writes.
    return system.m


def interface(m):
    @m.gl.evm.contract_interface
    class ReceiptRouter:
        class View:
            def released(self, receipt_id: m.u256, /) -> m.u256: ...

        class Write:
            def fund(self, receipt_id: m.u256, /) -> None: ...

    return ReceiptRouter(m.Address("0x" + "11" * 20))


def capture_host(monkeypatch):
    calls = []

    class Captured:
        def get(self):
            return None

    def capture(payload, decoder):
        calls.append(payload)
        return Captured()

    module = importlib.import_module("genlayer.gl._internal.gl_call")
    monkeypatch.setattr(module, "gl_call_generic", capture)
    return calls


def test_unselected_high_level_view_defect_remains_explicit(pinned_sdk, monkeypatch):
    m = pinned_sdk
    calls = capture_host(monkeypatch)
    with pytest.raises(AttributeError, match="parent"):
        interface(m).view().released(m.u256(7))
    assert calls == []


def test_unselected_high_level_emit_value_defect_remains_explicit(pinned_sdk, monkeypatch):
    m = pinned_sdk
    calls = capture_host(monkeypatch)
    interface(m).emit(value=m.u256(123)).fund(m.u256(7))
    assert len(calls) == 1
    assert calls[0]["EthSend"]["value"] == 0
    assert int.from_bytes(calls[0]["EthSend"]["calldata"][-32:], "big") == 7


def test_web_redirect_capability_gate_is_closed_on_pinned_runner(pinned_sdk):
    """Capability gate, complemented by the real native redirect probe.

    The inspected release's HTTP client uses the default redirect policy. A
    later version must expose documented control/history, or replace this gate
    with a real-runtime proof of an unconditional no-follow policy. Until then,
    absence is the expected safety state and external review stays disabled.
    """
    web = pinned_sdk.gl.nondet.web
    parameters = inspect.signature(web.request).parameters
    response_fields = web.Response.__dataclass_fields__
    has_control = any(name in parameters for name in (
        "allow_redirects", "follow_redirects", "redirect_policy", "max_redirects"
    ))
    has_history = "history" in response_fields or "redirects" in response_fields
    assert not has_control and not has_history
