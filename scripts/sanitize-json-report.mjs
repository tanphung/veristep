import { readFile, writeFile } from "node:fs/promises";

const paths = process.argv.slice(2);
if (!paths.length) throw new Error("Pass one or more JSON report paths");

const sensitiveKeys = new Set([
  "private_key",
  "privateKey",
  "api_key",
  "apiKey",
  "authorization",
  "access_token",
  "refresh_token",
]);

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      sensitiveKeys.has(key) ? "[redacted]" : sanitize(item),
    ]));
  }
  return value;
}

for (const path of paths) {
  const value = JSON.parse(await readFile(path, "utf8"));
  await writeFile(path, `${JSON.stringify(sanitize(value), null, 2)}\n`);
}
