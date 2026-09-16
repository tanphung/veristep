import { readFile } from "node:fs/promises";
import { createClient } from "genlayer-js";
import { localnet } from "genlayer-js/chains";

const endpoint = "http://127.0.0.1:4000/api";
const client = createClient({
  chain: { ...localnet, rpcUrls: { default: { http: [endpoint] } } },
  endpoint,
});
const minimal = `# v0.2.16
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
class Minimal(gl.Contract):
    value: u256
    def __init__(self):
        self.value = 0
    @gl.public.view
    def get(self) -> u256:
        return self.value
`;

for (const [name, code] of [
  ["full", await readFile("contracts/tasktrace_v2.py", "utf8")],
  ["full-versioned", `# v0.2.16\n${await readFile("contracts/tasktrace_v2.py", "utf8")}`],
  ["minimal", minimal],
]) {
  try {
    const schema = await client.getContractSchemaForCode(code);
    console.log(name, "OK", Object.keys(schema));
  } catch (error) {
    console.log(name, "ERROR", error.shortMessage ?? error.message);
  }
}
