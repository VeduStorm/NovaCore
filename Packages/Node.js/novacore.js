// File: license.js
// Standalone ESM module exposing ONLY `login(configPath?)`.
// It performs license verification and directly exits the process with an appropriate code.
// Exit codes:
// 0: success
// 2: config error
// 3: API error
// 4: mismatches
// 5: invalid license key

import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const DEFAULT_TIMEOUT_MS = 15000;

// Internal helpers
function resolveCwd(...parts) {
  return path.resolve(process.cwd(), ...parts);
}

function loadConfig(configPath = "config/config.json") {
  const fullPath = resolveCwd(configPath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Config file not found at ${fullPath}`);
  }
  let raw;
  try {
    raw = fs.readFileSync(fullPath, { encoding: "utf-8" });
  } catch (e) {
    throw new Error(`Failed to read ${fullPath}: ${e.message}`);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid JSON in ${fullPath}: ${e.message}`);
  }
  if (!data.license || typeof data.license !== "object") {
    throw new Error('Config must contain object "license"');
  }
  const lic = data.license;

  // Only 'url' and 'key' are strictly required; discord_id/product_name/product_id are optional.
  const required = ["url", "key"];
  const missing = required.filter((k) => !lic[k]);
  if (missing.length > 0) {
    throw new Error(`Missing required fields in license: ${missing.join(", ")}`);
  }
  if (typeof lic.url !== "string" || !/^https?:\/\//i.test(lic.url)) {
    throw new Error("license.url must be a valid HTTP(S) URL");
  }
  if (typeof lic.key !== "string") {
    throw new Error("license.key must be a string");
  }

  // Optional fields can be string or null/undefined; we won’t enforce types for optional fields.
  return data;
}

async function callLicenseApi(url, key, { timeoutMs = DEFAULT_TIMEOUT_MS, useBody = false } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  const headers = {
    Accept: "application/json",
    "User-Agent": "LicenseCheck/1.0",
    LICENSE_KEY: key,
  };

  const init = {
    method: "POST",
    headers,
    signal: controller.signal,
  };

  if (useBody) {
    init.body = JSON.stringify({ license: key });
    headers["Content-Type"] = "application/json";
  }

  let resp;
  try {
    resp = await fetch(url, init);
  } catch (e) {
    clearTimeout(t);
    if (e.name === "AbortError") {
      throw new Error(`Network error calling license API: Request timed out after ${timeoutMs}ms`);
    }
    throw new Error(`Network error calling license API: ${e.message}`);
  }
  clearTimeout(t);

  // Special 404 handling to normalize INVALID_LICENSE_KEY
  if (resp.status === 404) {
    let serverMessage = "";
    let invalidKey = false;
    let preview = "";

    const ct = resp.headers.get("content-type") || "";
    try {
      if (ct.toLowerCase().includes("application/json")) {
        const body = await resp.json();
        serverMessage = body?.message || "";
        const status = body?.status;
        const success = body?.success;
        const sm = (serverMessage || "").toLowerCase();
        if (sm.includes("license") && (sm.includes("not found") || sm.includes("invalid"))) {
          invalidKey = true;
        }
        if (!invalidKey && status === "error" && success === false && sm.includes("key")) {
          invalidKey = true;
        }
      } else {
        const txt = await resp.text();
        preview = (txt || "").slice(0, 300);
      }
    } catch {
      try {
        const txt = await resp.text();
        preview = (txt || "").slice(0, 300);
      } catch {
        preview = "";
      }
    }

    if (invalidKey) {
      return {
        error: {
          code: 404,
          reason: "Not Found",
          message: serverMessage || "License key not found",
          type: "INVALID_LICENSE_KEY",
        },
        success: false,
        status: "error",
      };
    }
    throw new Error(`HTTP 404 Not Found. Body: ${serverMessage || preview}`);
  }

  if (!resp.ok) {
    const txt = await resp.text().catch(() => "");
    const preview = (txt || "").slice(0, 300);
    throw new Error(`HTTP ${resp.status} ${resp.statusText}. Body: ${preview}`);
  }

  const ct = resp.headers.get("content-type") || "";
  if (resp.status === 204) {
    throw new Error("API returned no content");
  }

  try {
    return await resp.json();
  } catch {
    const txt = await resp.text().catch(() => "");
    const preview = (txt || "").slice(0, 300);
    throw new Error(`Non-JSON response. Content-Type: ${ct}. Body: ${preview}`);
  }
}

function compareValues(cfg, response) {
  const licCfg = cfg.license;
  const expectedKey = licCfg.key;
  const expectedDiscord = licCfg.discord_id ?? null;       // optional
  const expectedProductName = licCfg.product_name ?? null;  // optional
  const expectedProductId = licCfg.product_id ?? null;      // optional

  const normalizedError = response?.error;
  if (normalizedError && typeof normalizedError === "object" && normalizedError.type === "INVALID_LICENSE_KEY") {
    const checks = {
      api_success: false,
      license_active: false,
      key_matches: false,
      discord_matches: false,
      product_name_matches: false,
      product_id_matches: false,
      not_expired: false,
    };
    const mismatches = ["Invalid License Key"];
    const message = normalizedError.message;
    return {
      ok: false,
      checks,
      mismatches,
      message,
      expires_at: null,
      days_to_expiry: null,
      remaining_ips: 0,
      max_ips: 0,
      used_ips_count: 0,
      error_type: "INVALID_LICENSE_KEY",
      error_http: `${normalizedError.code} ${normalizedError.reason}`,
    };
  }

  const lic = response?.license || {};
  const cust = response?.customer || {};
  const prod = response?.product || {};

  const now = new Date();

  // Parse ISO date (supports "Z" and offset); if invalid, treat as null
  let expiresDt = null;
  if (typeof lic.expires_at === "string") {
    const d = new Date(lic.expires_at);
    if (!Number.isNaN(d.getTime())) {
      expiresDt = d;
    }
  }

  const usedIps = Array.isArray(lic.used_ips) ? lic.used_ips : [];
  const maxIps = Number.isInteger(lic.max_ips) ? lic.max_ips : 0;
  const usedIpsCount = usedIps.length;
  const remainingIps = Math.max(0, maxIps - usedIpsCount);

  const successFlag = response?.success;
  const statusText = response?.status;
  const apiSuccess = (successFlag === true) || (successFlag == null && (statusText == null || statusText === "success"));

  // Server values
  const serverLicenseKey = lic.license_key;
  const serverDiscordId = cust.discord_id ?? null;
  const serverProductName = prod.name ?? null;
  const serverProductId = prod.id ?? null;

  // Skip conditions: skip if server returns null OR expected (config) is null/missing
  const skipDiscordCheck = serverDiscordId == null || expectedDiscord == null;
  const skipProductNameCheck = serverProductName == null || expectedProductName == null;
  const skipProductIdCheck = serverProductId == null || expectedProductId == null;

  const checks = {
    api_success: apiSuccess,
    license_active: lic.status === "active",
    key_matches: serverLicenseKey === expectedKey,
    discord_matches: skipDiscordCheck ? true : (serverDiscordId === expectedDiscord),
    product_name_matches: skipProductNameCheck ? true : (serverProductName === expectedProductName),
    product_id_matches: skipProductIdCheck ? true : (serverProductId === expectedProductId),
    not_expired: !expiresDt || expiresDt > now,
  };

  const mismatches = [];
  if (!checks.api_success) {
    mismatches.push(`API status indicates failure (status="${statusText}", success=${successFlag})`);
  }
  if (!checks.license_active) {
    mismatches.push(`License status is "${lic.status}"`);
  }
  if (!checks.key_matches) {
    mismatches.push("license_key in response does not match config.key");
  }
  if (!skipDiscordCheck && !checks.discord_matches) {
    mismatches.push("customer.discord_id does not match config.discord_id");
  }
  if (!skipProductNameCheck && !checks.product_name_matches) {
    mismatches.push("product.name does not match config.product_name");
  }
  if (!skipProductIdCheck && !checks.product_id_matches) {
    mismatches.push("product.id does not match config.product_id");
  }
  if (!checks.not_expired) {
    mismatches.push("license is expired");
  }

  let daysToExpiry = null;
  if (expiresDt) {
    const millis = expiresDt.getTime() - now.getTime();
    daysToExpiry = Math.floor(millis / (1000 * 60 * 60 * 24));
  }

  return {
    ok: mismatches.length === 0,
    checks,
    mismatches,
    message: response?.message,
    expires_at: expiresDt ? expiresDt.toISOString() : null,
    days_to_expiry: daysToExpiry,
    remaining_ips: remainingIps,
    max_ips: maxIps,
    used_ips_count: usedIpsCount,
  };
}

export async function login(configPath = "config/config.json") {
  let exitCode = 0;

  let cfg;
  try {
    cfg = loadConfig(configPath);
  } catch (e) {
    console.log(`[CONFIG ERROR] ${e.message}`);
    exitCode = 2;
    process.exit(exitCode);
  }

  let resp;
  try {
    resp = await callLicenseApi(cfg.license.url, cfg.license.key, { useBody: false });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("HTTP 500") || msg.includes("Internal Server Error")) {
      try {
        resp = await callLicenseApi(cfg.license.url, cfg.license.key, { useBody: true });
      } catch (e2) {
        console.log(`[API ERROR] ${e2.message || e2}`);
        exitCode = 3;
        process.exit(exitCode);
      }
    } else {
      console.log(`[API ERROR] ${e.message || e}`);
      exitCode = 3;
      process.exit(exitCode);
    }
  }

  const result = compareValues(cfg, resp);

  console.log("License verification summary:");
  console.log(` - Active: ${result.checks.license_active}`);
  console.log(` - Not expired: ${result.checks.not_expired}`);
  console.log(` - Expires at: ${result.expires_at}`);
  console.log(` - Days to expiry: ${result.days_to_expiry}`);

  if (!result.ok) {
    console.log("[MISMATCHES]");
    for (const m of result.mismatches) {
      console.log(` - ${m}`);
    }
    if (result.error_type === "INVALID_LICENSE_KEY") {
      const msg2 = result.message;
      if (msg2) {
        console.log(` - Server response: ${msg2}`);
      }
      exitCode = 5;
      process.exit(exitCode);
    }
    exitCode = 4;
    process.exit(exitCode);
  }

  console.log("All checks passed.");
}

export async function login_silent(configPath = "config/config.json") {
  let exitCode = 0;

  let cfg;
  try {
    cfg = loadConfig(configPath);
  } catch (e) {
    console.log(`[CONFIG ERROR] ${e.message}`);
    exitCode = 2;
    process.exit(exitCode);
  }

  let resp;
  try {
    resp = await callLicenseApi(cfg.license.url, cfg.license.key, { useBody: false });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("HTTP 500") || msg.includes("Internal Server Error")) {
      try {
        resp = await callLicenseApi(cfg.license.url, cfg.license.key, { useBody: true });
      } catch (e2) {
        console.log(`[API ERROR] ${e2.message || e2}`);
        exitCode = 3;
        process.exit(exitCode);
      }
    } else {
      console.log(`[API ERROR] ${e.message || e}`);
      exitCode = 3;
      process.exit(exitCode);
    }
  }

  const result = compareValues(cfg, resp);


  if (!result.ok) {
    console.log("[MISMATCHES]");
    for (const m of result.mismatches) {
      console.log(` - ${m}`);
    }
    if (result.error_type === "INVALID_LICENSE_KEY") {
      const msg2 = result.message;
      if (msg2) {
        console.log(` - Server response: ${msg2}`);
      }
      exitCode = 5;
      process.exit(exitCode);
    }
    exitCode = 4;
    process.exit(exitCode);
  }

}

export async function login_noexit(configPath = "config/config.json") {

  let cfg;
  try {
    cfg = loadConfig(configPath);
  } catch (e) {
    console.log(`[CONFIG ERROR] ${e.message}`);
  }

  let resp;
  try {
    resp = await callLicenseApi(cfg.license.url, cfg.license.key, { useBody: false });
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes("HTTP 500") || msg.includes("Internal Server Error")) {
      try {
        resp = await callLicenseApi(cfg.license.url, cfg.license.key, { useBody: true });
      } catch (e2) {
        console.log(`[API ERROR] ${e2.message || e2}`);
      }
    } else {
      console.log(`[API ERROR] ${e.message || e}`);
    }
  }

  const result = compareValues(cfg, resp);

  console.log("License verification summary:");
  console.log(` - Active: ${result.checks.license_active}`);
  console.log(` - Not expired: ${result.checks.not_expired}`);
  console.log(` - Expires at: ${result.expires_at}`);
  console.log(` - Days to expiry: ${result.days_to_expiry}`);

  if (!result.ok) {
    console.log("[MISMATCHES]");
    for (const m of result.mismatches) {
      console.log(` - ${m}`);
    }
    if (result.error_type === "INVALID_LICENSE_KEY") {
      const msg2 = result.message;
      if (msg2) {
        console.log(` - Server response: ${msg2}`);
      }
    }
  }

  console.log("All checks passed.");
}