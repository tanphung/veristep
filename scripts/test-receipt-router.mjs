import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { artifacts, network, solidity } from "hardhat";
import { encodePacked, getContract, sha256 } from "viem";

const buildResult = await solidity.build([
  fileURLToPath(new URL("../contracts/VeriStepReceiptRouter.sol", import.meta.url)),
  fileURLToPath(new URL("../tests/evm/ReceiptRouterHarness.sol", import.meta.url)),
], { force: true, quiet: true, cleanupArtifacts: true });
assert.ok(solidity.isSuccessfulBuildResult(buildResult), "Solidity build failed");
const { viem } = await network.create();
const publicClient = await viem.getPublicClient();
const wallets = await viem.getWalletClients();
const [source, recipient, outsider] = wallets;
const compiled = await artifacts.readArtifact("VeriStepReceiptRouter");
async function deploy(name) {
  const artifact = await artifacts.readArtifact(name);
  const hash = await source.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  assert.ok(receipt.contractAddress);
  return getContract({ address: receipt.contractAddress, abi: artifact.abi, client: { public: publicClient, wallet: source } });
}
const router = await deploy("VeriStepReceiptRouter");

const receiptId = `0x${"11".repeat(32)}`;
const dealHash = `0x${"22".repeat(32)}`;
const termsHash = `0x${"33".repeat(32)}`;
const decisionHash = `0x${"44".repeat(32)}`;
const amount = 123456789n;
const args = [receiptId, dealHash, 1, 7, termsHash, decisionHash, recipient.account.address, 1];
const outsiderRouter = getContract({ address: router.address, abi: compiled.abi, client: { public: publicClient, wallet: outsider } });

// An attacker may use the same predictable receipt ID, but only inside its own
// source namespace. It cannot block or authenticate the legitimate IC receipt.
await outsiderRouter.write.fund([receiptId, dealHash, 1, 7, termsHash, decisionHash, outsider.account.address, 1], { value: 1n });
assert.equal(await router.read.receiptState([outsider.account.address, receiptId]), 1);
assert.equal(await router.read.receiptState([source.account.address, receiptId]), 0);
await router.write.fund(args, { value: amount, account: source.account });
assert.equal(await router.read.receiptState([source.account.address, receiptId]), 1);
assert.equal(await publicClient.getBalance({ address: router.address }), amount + 1n);

const fundedDigest = sha256(encodePacked(
  ["string", "bytes1", "uint256", "address", "address", "bytes32", "uint8", "uint32", "bytes32", "bytes32", "bytes32", "address", "uint256", "uint8", "uint8"],
  ["VERISTEP_RECEIPT_V2", "0x00", await publicClient.getChainId(), router.address, source.account.address, dealHash, 1, 7, termsHash, decisionHash, receiptId, recipient.account.address, amount, 1, 1],
));
assert.equal(await router.read.receiptDigest([source.account.address, receiptId]), fundedDigest);

await assert.rejects(router.write.fund(args, { value: amount, account: outsider.account }));
await assert.rejects(outsiderRouter.write.release([source.account.address, receiptId]));
assert.equal(await router.read.receiptState([source.account.address, receiptId]), 1);

const recipientRouter = getContract({ address: router.address, abi: compiled.abi, client: { public: publicClient, wallet: recipient } });
await recipientRouter.write.release([source.account.address, receiptId]);
assert.equal(await router.read.receiptState([source.account.address, receiptId]), 2);
assert.equal(await router.read.receiptState([outsider.account.address, receiptId]), 1);
assert.equal(await publicClient.getBalance({ address: router.address }), 1n);

const releasedDigest = sha256(encodePacked(
  ["string", "bytes1", "uint256", "address", "address", "bytes32", "uint8", "uint32", "bytes32", "bytes32", "bytes32", "address", "uint256", "uint8", "uint8"],
  ["VERISTEP_RECEIPT_V2", "0x00", await publicClient.getChainId(), router.address, source.account.address, dealHash, 1, 7, termsHash, decisionHash, receiptId, recipient.account.address, amount, 1, 2],
));
assert.equal(await router.read.receiptDigest([source.account.address, receiptId]), releasedDigest);
await assert.rejects(recipientRouter.write.release([source.account.address, receiptId]));

const rejecting = await deploy("RejectingReceiptRecipient");
const rejectedId = `0x${"55".repeat(32)}`;
await router.write.fund([rejectedId, dealHash, 2, 8, termsHash, decisionHash, rejecting.address, 2], { value: 100n, account: source.account });
await assert.rejects(rejecting.write.trigger([router.address, source.account.address, rejectedId]));
assert.equal(await router.read.receiptState([source.account.address, rejectedId]), 1);
assert.equal(await publicClient.getBalance({ address: router.address }), 101n);

const reentering = await deploy("ReenteringReceiptRecipient");
const reenteredId = `0x${"66".repeat(32)}`;
await router.write.fund([reenteredId, dealHash, 2, 9, termsHash, decisionHash, reentering.address, 3], { value: 200n, account: source.account });
await reentering.write.trigger([router.address, source.account.address, reenteredId]);
assert.equal(await router.read.receiptState([source.account.address, reenteredId]), 2);
assert.equal(await reentering.read.reentered(), false);
assert.equal(await publicClient.getBalance({ address: reentering.address }), 200n);
assert.equal(await publicClient.getBalance({ address: router.address }), 101n);

console.log(JSON.stringify({ passed: true, cases: 20, router: router.address }));
