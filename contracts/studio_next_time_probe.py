# { "Depends": "py-genlayer:5jycge4q8k23462jtb0b9fyey1s9qz928sz2nbrd9mg4sxqg2qng" }

import json
import time

import genlayer as gl


class StudioNextTimeProbe(gl.contract.Contract):
    """Independent, state-free probe for a Studio Next simulated write."""

    def __init__(self):
        pass

    @gl.public.write
    def probe(self) -> str:
        return json.dumps(
            {
                "gl.message_raw.datetime": gl.message.raw["datetime"],
                "time.time": time.time(),
            },
            sort_keys=True,
            separators=(",", ":"),
        )
