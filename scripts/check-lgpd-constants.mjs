#!/usr/bin/env node
// Build/deploy gate (LGPD art. 6º VI — transparency): refuse to ship while
// src/client/lgpd/constants.ts still holds template placeholders for the
// data controller / DPO. Shipping placeholder controller info means the
// privacy policy names no real, contactable controller — a transparency
// failure. setup-lgpd.sh warns about this interactively; this turns the
// warning into a hard gate in the deploy path.
//
// Exit 0 = clean, exit 1 = placeholders found.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const target = join(here, "..", "src", "client", "lgpd", "constants.ts");

let source;
try {
  source = readFileSync(target, "utf8");
} catch (err) {
  console.error(`check-lgpd-constants: cannot read ${target}: ${err.message}`);
  process.exit(1);
}

// Only scan the controller/DPO object literals — scanning the whole file
// would false-positive on TypeScript array/type syntax like ["en","pt-BR"].
const blocks = [];
for (const name of ["CONTROLLER_INFO", "DPO_INFO"]) {
  const re = new RegExp(`${name}\\s*=\\s*\\{([\\s\\S]*?)\\}`);
  const m = source.match(re);
  if (m) blocks.push(m[1]);
}
const scanned = blocks.join("\n");

// A placeholder is either a bracketed template token like "[CNPJ]" or an
// example.com contact address. Both must be replaced before going live.
const offenders = [];
for (const match of scanned.matchAll(/\[[^\]]+\]/g)) {
  offenders.push(match[0]);
}
for (const match of scanned.matchAll(/[A-Za-z0-9._%+-]+@example\.com/g)) {
  offenders.push(match[0]);
}

if (offenders.length > 0) {
  console.error(
    "check-lgpd-constants: placeholder controller/DPO data still present in\n" +
      `  ${target}\n` +
      "Replace these before deploying:\n" +
      offenders.map((o) => `  - ${o}`).join("\n")
  );
  process.exit(1);
}

console.log("check-lgpd-constants: controller/DPO data looks populated.");
