"""Reproduce redirect visibility with unmodified official local GenVM web module.

Uses only two loopback hostnames, ephemeral ports and temporary configs. This
is a capability diagnostic, not production provenance or a Bradbury assertion.
"""
import argparse
import asyncio
import json
from pathlib import Path
import socket
import sys
import tempfile

from aiohttp import web
import yaml


def free_port():
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


async def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime", required=True, type=Path)
    parser.add_argument("--reference", required=True, type=Path)
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    requests = []
    http_port, module_port = free_port(), free_port()

    async def fixture(request):
        requests.append({"host": request.host, "path": request.path})
        if request.path == "/start":
            raise web.HTTPFound(f"http://localhost:{http_port}/final")
        return web.json_response({"fixture": "redirected-artifact", "complete": True})

    app = web.Application()
    app.router.add_get("/start", fixture)
    app.router.add_get("/final", fixture)
    server = web.AppRunner(app)
    await server.setup()
    await web.TCPSite(server, "127.0.0.1", http_port).start()
    module = probe = None
    with tempfile.TemporaryDirectory(prefix="veristep-web-") as temporary:
        temp = Path(temporary)
        config = yaml.safe_load((args.runtime / "config/genvm-module-web.yaml").read_text())
        config.update(bind_address=f"127.0.0.1:{module_port}", always_allow_hosts=["localhost", "127.0.0.1"], signer_url="http://127.0.0.1:1")
        module_config = temp / "web.yaml"
        module_config.write_text(yaml.safe_dump(config))
        executor = args.runtime / "executor/v0.2.12/bin/genvm"
        config = yaml.safe_load((executor.parent.parent / "config/genvm.yaml").read_text())
        config["modules"]["web"]["address"] = f"ws://127.0.0.1:{module_port}"
        executor_config = temp / "genvm.yaml"
        executor_config.write_text(yaml.safe_dump(config))
        try:
            with (temp / "module.log").open("wb") as log:
                module = await asyncio.create_subprocess_exec(str(args.runtime / "bin/genvm-modules"), "web", "--config", str(module_config), stdout=log, stderr=log)
                for _ in range(100):
                    if module.returncode is not None:
                        raise RuntimeError((temp / "module.log").read_text())
                    try:
                        _, writer = await asyncio.open_connection("127.0.0.1", module_port)
                        writer.close()
                        await writer.wait_closed()
                        break
                    except OSError:
                        await asyncio.sleep(0.1)
                else:
                    raise TimeoutError("local web module did not start")
                probe = await asyncio.create_subprocess_exec(sys.executable, str(root / "scripts/native-v2-probe.py"), "--genvm", str(executor), "--reference", str(args.reference), "--config", str(executor_config), "--web-url", f"http://127.0.0.1:{http_port}/start", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                stdout, stderr = await asyncio.wait_for(probe.communicate(), 180)
                report = {"scope": "LOCAL_OFFICIAL_WEB_MODULE_CAPABILITY_NOT_BRADBURY", "requests": requests, "exit": probe.returncode, "stdout": stdout.decode(), "stderr": stderr.decode(), "module_log": (temp / "module.log").read_text()}
                (root / "reports/v2-native-redirect.json").write_text(json.dumps(report, indent=2) + "\n")
                assert probe.returncode == 0, report
                assert requests == [{"host": f"127.0.0.1:{http_port}", "path": "/start"}, {"host": f"localhost:{http_port}", "path": "/final"}], report
                native = json.loads((root / "reports/v2-native-web.json").read_text())
                line = next(line for line in native["stdout"].splitlines() if line.startswith("VERISTEP_NATIVE_WEB_RESPONSE="))
                response = json.loads(line.split("=", 1)[1])
                assert response["status"] == 200 and not response["has_url"] and not response["has_history"], response
                assert json.loads(response["body"])["fixture"] == "redirected-artifact", response
                print("CONFIRMED: local official web module follows cross-host redirect; IC receives final 200/body without URL/history. External evidence gate remains CLOSED.")
        finally:
            for process in (probe, module):
                if process is not None and process.returncode is None:
                    process.terminate()
                    await process.wait()
            await server.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
