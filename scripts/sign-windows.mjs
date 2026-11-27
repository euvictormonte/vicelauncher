#!/usr/bin/env node
// Signs one Windows binary with signtool, for Tauri's bundle > windows > signCommand.
// Tauri calls it with the file to sign as the only argument (`%1` in tauri.conf.json).
//
// Signing is optional on purpose: without NEVES_LAUNCHER_SIGN_THUMBPRINT the build still
// succeeds and ships unsigned, exactly as before. Traps (Trapmine and friends) flag
// fresh unsigned binaries, so releases should be signed. See docs/FALSE-POSITIVES.md.
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/sign-windows.mjs <file>");
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`sign-windows: ${file} does not exist`);
  process.exit(1);
}

const thumbprint = (
  process.env.NEVES_LAUNCHER_SIGN_THUMBPRINT ??
  process.env.VILAUNCHER_SIGN_THUMBPRINT ??
  ""
).replace(/\s/g, "");
if (!thumbprint) {
  console.log(`sign-windows: no certificate configured, ${file} stays unsigned`);
  process.exit(0);
}

const timestamp = process.env.NEVES_LAUNCHER_TIMESTAMP_URL || process.env.VILAUNCHER_TIMESTAMP_URL || "http://timestamp.digicert.com";
const signtool = findSigntool();
if (!signtool) {
  console.error(
    "sign-windows: signtool.exe was not found. Install the Windows SDK, or set SIGNTOOL_PATH.",
  );
  process.exit(1);
}

const sign = spawnSync(
  signtool,
  ["sign", "/sha1", thumbprint, "/fd", "sha256", "/tr", timestamp, "/td", "sha256", file],
  { stdio: "inherit" },
);
if (sign.status !== 0) {
  console.error(`sign-windows: signtool could not sign ${file}`);
  process.exit(sign.status ?? 1);
}

// A broken signature is worse than none: check it before the build moves on.
const verify = spawnSync(signtool, ["verify", "/pa", file], { stdio: "inherit" });
if (verify.status !== 0) {
  console.error(`sign-windows: the signature on ${file} does not verify`);
  process.exit(verify.status ?? 1);
}

const sha256 = createHash("sha256").update(readFileSync(file)).digest("hex");
console.log(`sign-windows: signed ${file}`);
console.log(`sign-windows: sha256 ${sha256}`);

/** The signing tool: SIGNTOOL_PATH, then PATH, then the newest installed SDK. */
function findSigntool() {
  if (process.env.SIGNTOOL_PATH) {
    return existsSync(process.env.SIGNTOOL_PATH) ? process.env.SIGNTOOL_PATH : null;
  }
  const onPath = spawnSync("where.exe", ["signtool.exe"], { encoding: "utf8" });
  const first = onPath.stdout?.split(/\r?\n/).find((line) => line.trim());
  if (onPath.status === 0 && first) return first.trim();

  const roots = [
    "C:\\Program Files (x86)\\Windows Kits\\10\\bin",
    "C:\\Program Files\\Windows Kits\\10\\bin",
  ];
  const found = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const version of readdirSync(root).sort().reverse()) {
      const candidate = join(root, version, "x64", "signtool.exe");
      if (existsSync(candidate)) found.push(candidate);
    }
  }
  return found[0] ?? null;
}
