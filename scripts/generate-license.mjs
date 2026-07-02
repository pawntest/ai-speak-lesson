#!/usr/bin/env node
// Pro license key generator (run by the operator, never shipped to clients).
// Usage: LICENSE_SECRET=... node scripts/generate-license.mjs buyer@example.com
// Key format: CDE-<base64url(email|yyyymmdd)>-<hmac16>
// Validation (server): recompute HMAC-SHA256(payload, LICENSE_SECRET), compare first 16 hex chars.
import { createHmac } from "node:crypto";

const secret = process.env.LICENSE_SECRET;
const email = process.argv[2];
if (!secret || !email) {
  console.error("Usage: LICENSE_SECRET=<secret> node scripts/generate-license.mjs <buyer-email>");
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
const payload = `${email}|${date}`;
const sig = createHmac("sha256", secret).update(payload).digest("hex").slice(0, 16);
const key = `CDE-${Buffer.from(payload).toString("base64url")}-${sig}`;

console.log(key);
