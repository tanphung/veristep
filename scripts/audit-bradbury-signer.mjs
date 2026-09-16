import assert from "node:assert/strict";
import { createPublicClient, http } from "viem";
import { testnetBradbury } from "genlayer-js/chains";

const address = process.argv[2]?.toLowerCase();
assert.match(address ?? "", /^0x[0-9a-f]{40}$/, "Usage: node scripts/audit-bradbury-signer.mjs 0x...");
const client = createPublicClient({ chain: testnetBradbury, transport: http() });
const latest = await client.getBlockNumber();
const depth = BigInt(process.env.VERISTEP_AUDIT_BLOCKS ?? "180");
const start = latest >= depth ? latest - depth + 1n : 0n;
const matches = [];
for (let cursor = start; cursor <= latest; cursor += 20n) {
  const end = cursor + 19n > latest ? latest : cursor + 19n;
  const blocks = await Promise.all(Array.from({ length: Number(end - cursor + 1n) }, (_, index) =>
    client.getBlock({ blockNumber: cursor + BigInt(index), includeTransactions: true }),
  ));
  for (const block of blocks) {
    for (const transaction of block.transactions) {
      if (typeof transaction !== "string" && transaction.from.toLowerCase() === address) {
        matches.push({
          block: block.number.toString(),
          hash: transaction.hash,
          nonce: transaction.nonce,
          to: transaction.to,
          inputBytes: (transaction.input.length - 2) / 2,
        });
      }
    }
  }
}
console.log(JSON.stringify({ address, latest: latest.toString(), start: start.toString(), matches }, null, 2));
