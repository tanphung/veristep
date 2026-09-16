import assert from "node:assert/strict";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createAccount, generatePrivateKey } from "genlayer-js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const secretsPath = resolve(root, ".secrets", "hosted-worker-wallets.json");
const exists = (path) => access(path).then(() => true, () => false);

await mkdir(dirname(secretsPath), { recursive: true });
if (!await exists(secretsPath)) {
  await writeFile(secretsPath, `${JSON.stringify({
    WORKER_A_PRIVATE_KEY: generatePrivateKey(),
    WORKER_B_PRIVATE_KEY: generatePrivateKey(),
  }, null, 2)}\n`, { mode: 0o600, flag: "wx" });
}

const secrets = JSON.parse(await readFile(secretsPath, "utf8"));
for (const name of ["WORKER_A_PRIVATE_KEY", "WORKER_B_PRIVATE_KEY"]) {
  assert.match(secrets[name] ?? "", /^0x[0-9a-fA-F]{64}$/, `${name} is invalid`);
}
const A = createAccount(secrets.WORKER_A_PRIVATE_KEY);
const B = createAccount(secrets.WORKER_B_PRIVATE_KEY);
assert.notEqual(A.address.toLowerCase(), B.address.toLowerCase(), "Worker wallets must be distinct");

console.log(JSON.stringify({
  created: true,
  secretFile: ".secrets/hosted-worker-wallets.json",
  wallets: { A: A.address, B: B.address },
}, null, 2));
