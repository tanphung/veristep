# { "Depends": "py-genlayer:1zr6nqk597d97kg0dyxg0shhrykx5v02zjgnyrajapy4wlqvfvwh" }

import genlayer as gl


class StudioNextTransferProbe(gl.contract.Contract):
    def __init__(self):
        pass

    @gl.public.write.payable
    def send(self, recipient: str) -> None:
        amount = gl.message.value
        if int(amount) <= 0:
            raise gl.vm.UserError("VALUE_REQUIRED")
        target = gl.Address(recipient)
        gl.chain.Account(target).emit_transfer(amount, on="finalized")

    @gl.public.view
    def get_state(self) -> dict:
        return {"state": "READY"}
