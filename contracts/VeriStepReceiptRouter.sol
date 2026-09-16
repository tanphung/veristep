// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Minimal native-GEN receipt router for VeriStep Intelligent Contracts.
/// It never decides entitlements. Each caller can only create receipts whose
/// sourceContract is that caller, and every immutable settlement field is kept.
contract VeriStepReceiptRouter {
    uint8 private constant FUNDED = 1;
    uint8 private constant RELEASED = 2;

    struct Receipt {
        address sourceContract;
        bytes32 dealHash;
        uint8 role;
        uint32 sequence;
        bytes32 termsHash;
        bytes32 decisionHash;
        address recipient;
        uint256 amount;
        uint8 kind;
        uint8 state;
    }

    mapping(address => mapping(bytes32 => Receipt)) private receipts;
    bool private entered;

    event ReceiptFunded(
        bytes32 indexed receiptId,
        address indexed sourceContract,
        bytes32 indexed dealHash,
        uint8 role,
        uint32 sequence,
        bytes32 termsHash,
        bytes32 decisionHash,
        address recipient,
        uint256 amount,
        uint8 kind
    );
    event ReceiptReleased(
        bytes32 indexed receiptId,
        address indexed sourceContract,
        address indexed recipient,
        uint256 amount
    );

    error InvalidReceipt();
    error ReceiptExists();
    error NotRecipient();
    error TransferFailed();
    error Reentrancy();

    function fund(
        bytes32 receiptId,
        bytes32 dealHash,
        uint8 role,
        uint32 sequence,
        bytes32 termsHash,
        bytes32 decisionHash,
        address recipient,
        uint8 kind
    ) external payable {
        if (
            receiptId == bytes32(0) || recipient == address(0) || msg.value == 0
                || (role != 1 && role != 2) || kind < 1 || kind > 3
        ) revert InvalidReceipt();
        if (receipts[msg.sender][receiptId].state != 0) revert ReceiptExists();
        receipts[msg.sender][receiptId] = Receipt({
            sourceContract: msg.sender,
            dealHash: dealHash,
            role: role,
            sequence: sequence,
            termsHash: termsHash,
            decisionHash: decisionHash,
            recipient: recipient,
            amount: msg.value,
            kind: kind,
            state: FUNDED
        });
        emit ReceiptFunded(
            receiptId,
            msg.sender,
            dealHash,
            role,
            sequence,
            termsHash,
            decisionHash,
            recipient,
            msg.value,
            kind
        );
    }

    function release(address sourceContract, bytes32 receiptId) external {
        Receipt storage receipt = receipts[sourceContract][receiptId];
        if (receipt.state != FUNDED) revert InvalidReceipt();
        if (msg.sender != receipt.recipient) revert NotRecipient();
        if (entered) revert Reentrancy();
        entered = true;
        receipt.state = RELEASED;
        (bool success,) = payable(receipt.recipient).call{value: receipt.amount}("");
        if (!success) revert TransferFailed();
        entered = false;
        emit ReceiptReleased(receiptId, sourceContract, receipt.recipient, receipt.amount);
    }

    function receiptDigest(address sourceContract, bytes32 receiptId) external view returns (bytes32) {
        Receipt storage receipt = receipts[sourceContract][receiptId];
        if (receipt.state == 0) return bytes32(0);
        return sha256(
            abi.encodePacked(
                "VERISTEP_RECEIPT_V2",
                bytes1(0),
                block.chainid,
                address(this),
                receipt.sourceContract,
                receipt.dealHash,
                receipt.role,
                receipt.sequence,
                receipt.termsHash,
                receipt.decisionHash,
                receiptId,
                receipt.recipient,
                receipt.amount,
                receipt.kind,
                receipt.state
            )
        );
    }

    function receiptState(address sourceContract, bytes32 receiptId) external view returns (uint8) {
        return receipts[sourceContract][receiptId].state;
    }
}
