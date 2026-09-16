// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IVeriStepReceiptRouter {
    function release(address sourceContract, bytes32 receiptId) external;
}

contract RejectingReceiptRecipient {
    function trigger(address router, address sourceContract, bytes32 receiptId) external {
        IVeriStepReceiptRouter(router).release(sourceContract, receiptId);
    }

    receive() external payable {
        revert("reject transfer");
    }
}

contract ReenteringReceiptRecipient {
    address private router;
    address private sourceContract;
    bytes32 private receiptId;
    bool public reentered;

    function trigger(address target, address source, bytes32 id) external {
        router = target;
        sourceContract = source;
        receiptId = id;
        IVeriStepReceiptRouter(target).release(source, id);
    }

    receive() external payable {
        (reentered,) = router.call(abi.encodeCall(IVeriStepReceiptRouter.release, (sourceContract, receiptId)));
    }
}
