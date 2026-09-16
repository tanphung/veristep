"""Real pinned GenVM + controlled host ABI test, NOT an EVM chain/committee test.

Run under Linux Python 3.12. Reuses the official v0.2.12 host protocol decoder;
the production core source is loaded intact and only test assertions appended.
No funded key, external transaction or deployed contract is used.
"""
import argparse
import asyncio
import hashlib
import json
from pathlib import Path
import socket
import sys
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument("--genvm", required=True, type=Path)
parser.add_argument("--reference", required=True, type=Path)
parser.add_argument("--web-url", help="Controlled local redirect fixture only")
parser.add_argument("--config", type=Path)
args = parser.parse_args()
root = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(args.reference / "runners/genlayer-py-std/src"))
sys.path.insert(0, str(args.reference / "tests/runner"))
from genlayer.py import calldata
from genlayer.py.types import Address
from origin.base_host import IHost, HostException, host_loop
from origin.host_fns import Errors
from origin.logger import NoLogger
from origin.public_abi import ResultCode


class ControlledHost(IHost):
    def __init__(self, listener):
        self.listener = listener
        self.connection = None
        self.reads = []
        self.sends = []
        self.nondet_results = []

    async def loop_enter(self, cancellation):
        self.connection, _ = await asyncio.get_running_loop().sock_accept(self.listener)
        self.connection.setblocking(False)
        return self.connection

    async def storage_read(self, mode, account, slot, index, length):
        return b"\0" * length

    async def get_leader_nondet_result(self, call_no):
        raise HostException(Errors.I_AM_LEADER)

    async def post_nondet_result(self, call_no, data):
        if not args.web_url:
            raise AssertionError("unexpected nondeterministic execution")
        self.nondet_results.append({"call_no": call_no, "bytes": len(data)})

    async def post_message(self, *unused):
        raise AssertionError("unexpected internal message")

    async def deploy_contract(self, *unused):
        raise AssertionError("unexpected deployment")

    async def consume_gas(self, gas):
        pass

    async def eth_send(self, account, data, metadata):
        self.sends.append({"address": account.hex(), "calldata": data.hex(), "value": metadata["value"]})

    async def eth_call(self, account, data):
        self.reads.append({"address": account.hex(), "calldata": data.hex()})
        return (123).to_bytes(32, "big")

    async def get_balance(self, account):
        return 1000

    async def remaining_fuel_as_gen(self):
        return 2**32

    async def notify_nondet_disagreement(self, call_no):
        raise AssertionError("unexpected validator disagreement")


async def main():
    source = (root / "contracts/veristep.py").read_bytes()
    probe = b'''
_probe_target = Address("0x" + "44" * 20)
_probe_call = gl.evm.MethodEncoder("released", (u256,), u256).encode_call((u256(7),))
_probe_result = _evm_read_exact(_probe_target, _probe_call)
assert int.from_bytes(_probe_result, "big") == 123, "native read bytes mismatch"
_probe_send = gl.evm.MethodEncoder("fund", (u256,), type(None)).encode_call((u256(7),))
_evm_send_exact(_probe_target, _probe_send, 123)
print("VERISTEP_NATIVE_EVM_ABI_PROBE_OK")
'''
    if args.web_url:
        assert args.web_url.startswith("http://127.0.0.1:"), "local fixture only"
        probe = ('''
def _probe_request():
    response = gl.nondet.web.request(%r, method="GET")
    return {"status": response.status, "body": response.body.decode("utf-8"),
            "has_url": hasattr(response, "url"), "has_history": hasattr(response, "history")}
def _probe_capabilities(self):
    result = gl.eq_principle.strict_eq(_probe_request)
    print("VERISTEP_NATIVE_WEB_RESPONSE=" + json.dumps(result, sort_keys=True))
    return json.dumps(result)
VeriStep.get_capabilities = gl.public.view(_probe_capabilities)
''' % args.web_url).encode()
    addr = Address("0x" + "11" * 20)
    payload = calldata.encode({
        "message": {"contract_address": addr, "sender_address": Address("0x" + "22" * 20), "origin_address": Address("0x" + "22" * 20), "chain_id": "1", "value": None, "is_init": False, "datetime": "2026-09-11T00:00:00Z"},
        "host_data": json.dumps({"node_address": "0x", "tx_id": "0x"}),
        # ExecutionData uses serde Vec<u8> sequences (unlike gl_call Bytes).
        "code": list(source + probe),
        "calldata": list(calldata.encode({"method": "get_capabilities", "args": []})),
    })
    with tempfile.TemporaryDirectory(prefix="veristep-native-") as temp:
        socket_path = str(Path(temp) / "host.sock")
        listener = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        listener.bind(socket_path)
        listener.listen(1)
        listener.setblocking(False)
        host = ControlledHost(listener)
        process = await asyncio.create_subprocess_exec(
            str(args.genvm), *(["--config", str(args.config)] if args.config else []), "--log-level", "error", "run", "--host", "unix://" + socket_path,
            "--storage-pages", "1000000", "--print=result", stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        host_task = asyncio.create_task(host_loop(host, asyncio.Event(), logger=NoLogger()))
        try:
            output, errors = await asyncio.wait_for(process.communicate(payload), timeout=150)
            if not host_task.done():
                host_task.cancel()
                failure = {"scope": "REAL_GENVM_CONTROLLED_HOST_NOT_CHAIN_E2E", "process_exit": process.returncode, "stdout": output.decode(), "stderr": errors.decode(), "error": "host did not complete"}
                (root / "reports/v2-native-startup-failure.json").write_text(json.dumps(failure, indent=2) + "\n")
                raise RuntimeError(failure)
            result = await host_task
            report = {"scope": "REAL_GENVM_CONTROLLED_HOST_NOT_CHAIN_E2E", "runner": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6", "source_sha256": hashlib.sha256(source).hexdigest(), "process_exit": process.returncode, "result_kind": result[0].name, "reads": host.reads, "sends": host.sends, "stdout": output.decode(), "stderr": errors.decode()}
            report["nondet_results"] = host.nondet_results
            name = "v2-native-web" if args.web_url else "v2-native-abi"
            (root / f"reports/{name}.json").write_text(json.dumps(report, indent=2) + "\n")
            assert process.returncode == 0 and result[0] == ResultCode.RETURN, report
            if args.web_url:
                assert b"VERISTEP_NATIVE_WEB_RESPONSE=" in output, report
                assert len(host.nondet_results) == 1 and not host.sends, report
                print("PASS: real GenVM web observation captured; no provenance approval implied.")
                return
            assert b"VERISTEP_NATIVE_EVM_ABI_PROBE_OK" in output, report
            assert len(host.reads) == len(host.sends) == 1, report
            assert host.reads[0]["address"] == host.sends[0]["address"] == "44" * 20, report
            assert int(host.sends[0]["value"], 16) == 123, report
            print("PASS: real GenVM read and send preserve exact target/value; EVM host is controlled, no payment made.")
        except BaseException:
            if process.returncode is None:
                process.kill()
                await process.wait()
            if not host_task.done():
                host_task.cancel()
            raise
        finally:
            if host.connection:
                host.connection.close()
            listener.close()


asyncio.run(main())
