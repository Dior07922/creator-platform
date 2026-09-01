#!/usr/bin/env node
const baseUrl = process.argv[2] || "http://localhost:3000";

async function probe(label, url, init) {
  try {
    const response = await fetch(url, init);
    let message = "";
    try { message = (await response.json()).message || ""; } catch { message = ""; }
    console.log(`${label} -> ${response.status} ${message}`);
  } catch (error) {
    console.log(`${label} -> ERROR ${error instanceof Error ? error.message : "未知错误"}`);
  }
}

await probe("GET  /api/auth/me", `${baseUrl}/api/auth/me`);
await probe("POST /api/auth/sms/send", `${baseUrl}/api/auth/sms/send`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "19900000000" }),
});
await probe("POST /api/auth/sms/verify", `${baseUrl}/api/auth/sms/verify`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: "19900000000", code: "000000" }),
});