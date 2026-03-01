export const prerender = false;

import { REGIONS, DEFAULT_REGION, API_HEADERS } from "../../../config/vinfast";
import crypto from "crypto";

// Restrict proxy usage to known VinFast API namespaces used by the dashboard.
const ALLOWED_PATH_PREFIXES = [
  "ccarusermgnt/api/v1/user-vehicle",
  "ccarusermgnt/api/v1/device-trust",
  "ccarusermgnt/api/v1/service-history",
  "ccarusermgnt/api/v1/service-appointments",
  "ccarbookingservice/api/v1/c-app/appointment/",
  "ccarbookingservice/api/v1/c-app/showroom/",
  "modelmgmt/api/v2/vehicle-model/",
  "ccaraccessmgmt/api/v1/telemetry/",
  "ccaraccessmgmt/api/v1/remote/app/wakeup",
  "ccarcharging/api/v1/stations/",
  "ccarcharging/api/v1/charging-sessions/search",
];

// Paths that require X-HASH + X-HASH-2 signing (beyond Bearer token)
const SIGNED_PATH_PREFIXES = ["ccaraccessmgmt/", "ccarcharging/"];

/**
 * Generate X-HASH for VinFast API request
 * Reverse-engineered from HMACInterceptor (app v2.17.5)
 *
 * Algorithm: HMAC-SHA256(key, message) -> Base64
 * Message: method_/path_[vin_]key_timestamp (all lowercased)
 * Key: "Vinfast@2025"
 */
function generateXHash(method, apiPath, vin, timestamp, secretKey) {
  const pathWithoutQuery = apiPath.split("?")[0];

  // HMACInterceptor uses request.url().encodedPath() which includes leading /
  const normalizedPath = pathWithoutQuery.startsWith("/")
    ? pathWithoutQuery
    : "/" + pathWithoutQuery;

  // Build: method_path_[vin_]secret_timestamp
  const parts = [method, normalizedPath];
  if (vin) {
    parts.push(vin);
  }
  parts.push(secretKey);
  parts.push(String(timestamp));

  const message = parts.join("_").toLowerCase();

  const hmac = crypto.createHmac("sha256", secretKey);
  hmac.update(message);
  return hmac.digest("base64");
}

/**
 * Generate X-HASH-2 for VinFast API request
 * Reverse-engineered from CryptoInterceptor + libsecure.so (app v2.17.5)
 *
 * Flow in app:
 *   1. TokenInterceptor sets all headers (X-Device-Platform, X-TIMESTAMP, etc.)
 *   2. CryptoInterceptor creates Message object from request headers
 *   3. Message serialized to JSON via Gson
 *   4. JSON passed to native VFCrypto.signRequest(json)
 *   5. Native code: cJSON_Parse → extract 6 fields → build message → toLower → HMAC-SHA256
 *
 * Native signRequest extracts these fields from JSON:
 *   - X-Device-Platform
 *   - X-Vin-Code (nullable)
 *   - X-Device-Identifier
 *   - X-PATH (= request.url().encodedPath())
 *   - X-METHOD (= request.method())
 *   - X-TIMESTAMP
 *
 * Path processing: strip leading "/", replace "/" with "_"
 * Message: platform_[vinCode_]identifier_path_method_timestamp (lowercased)
 * Key: "ConnectedCar@6521" (17 bytes, obfuscated char-by-char in native code)
 */
function generateXHash2({
  platform,
  vinCode,
  identifier,
  path,
  method,
  timestamp,
}) {
  // Native code: strip leading "/"
  let normalizedPath = path;
  if (normalizedPath.startsWith("/")) {
    normalizedPath = normalizedPath.substring(1);
  }

  // Native code: replace "/" with "_"
  normalizedPath = normalizedPath.replace(/\//g, "_");

  // Build message: platform_[vinCode_]identifier_path_method_timestamp
  const parts = [platform];
  if (vinCode) {
    parts.push(vinCode);
  }
  parts.push(identifier);
  parts.push(normalizedPath);
  parts.push(method);
  parts.push(String(timestamp));

  // Native code: toLower the entire assembled string
  const message = parts.join("_").toLowerCase();

  // HMAC-SHA256 with native key (from libsecure.so char-by-char build)
  const hash2Key = "ConnectedCar@6521";
  const hmac = crypto.createHmac("sha256", hash2Key);
  hmac.update(message);
  return hmac.digest("base64");
}

export const ALL = async ({ request, params, cookies, locals }) => {
  const apiPath = params.path;

  // Security: block path traversal and ensure target stays on VinFast domain
  if (apiPath.includes("..") || apiPath.includes("//") || apiPath.startsWith("/")) {
    return new Response(JSON.stringify({ error: "Invalid API path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isAllowedPath = ALLOWED_PATH_PREFIXES.some((prefix) =>
    apiPath.startsWith(prefix),
  );
  if (!isAllowedPath) {
    return new Response(JSON.stringify({ error: "Proxy path not allowed" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const urlObj = new URL(request.url);
  const region = urlObj.searchParams.get("region") || DEFAULT_REGION;
  const regionConfig = REGIONS[region] || REGIONS[DEFAULT_REGION];

  // Strip internal params from query
  const targetSearchParams = new URLSearchParams(urlObj.search);
  targetSearchParams.delete("region");

  const searchStr = targetSearchParams.toString();
  const targetUrl = `${regionConfig.api_base}/${apiPath}${searchStr ? "?" + searchStr : ""}`;

  const accessToken = cookies.get("access_token")?.value;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const clientHeaders = request.headers;
  const vinHeader = clientHeaders.get("x-vin-code");
  const playerHeader = clientHeaders.get("x-player-identifier");

  // Get request body for POST/PUT/PATCH
  let requestBody = null;
  if (request.method !== "GET" && request.method !== "HEAD") {
    requestBody = await request.text();
  }

  const requiresSigning = SIGNED_PATH_PREFIXES.some((prefix) =>
    apiPath.startsWith(prefix),
  );

  // Build headers matching TokenInterceptor header casing exactly
  const proxyHeaders = {
    ...API_HEADERS,
    "Content-Type": "application/json",
    Authorization: `Bearer ${accessToken}`,
  };

  if (requiresSigning) {
    const runtimeEnv = locals?.runtime?.env || import.meta.env || {};
    let secretKey =
      runtimeEnv.VINFAST_XHASH_SECRET ||
      (typeof process !== "undefined"
        ? process.env.VINFAST_XHASH_SECRET
        : undefined);

    if (!secretKey && import.meta.env.DEV) {
      secretKey = "Vinfast@2025";
      console.warn("DEV fallback: using default VINFAST_XHASH_SECRET.");
    }

    if (!secretKey) {
      console.error(
        "CRITICAL: VINFAST_XHASH_SECRET environment variable is missing",
      );
      return new Response(
        JSON.stringify({ error: "Server Configuration Error" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const timestamp = Date.now();
    const xTimestamp = String(timestamp);

    const xHash = generateXHash(
      request.method,
      apiPath,
      vinHeader,
      timestamp,
      secretKey,
    );

    const xHash2 = generateXHash2({
      platform: API_HEADERS["X-Device-Platform"] || "android",
      vinCode: vinHeader || null,
      identifier: API_HEADERS["X-Device-Identifier"] || "",
      path: "/" + apiPath,
      method: request.method,
      timestamp: xTimestamp,
    });

    proxyHeaders["X-HASH"] = xHash;
    proxyHeaders["X-HASH-2"] = xHash2;
    proxyHeaders["X-TIMESTAMP"] = xTimestamp;
    console.log(
      `[Proxy] Signed ${request.method} /${apiPath} with X-HASH + X-HASH-2`,
    );
    console.log(`[Proxy DEBUG] timestamp=${xTimestamp}`);
    console.log(`[Proxy DEBUG] X-HASH=${xHash}`);
    console.log(`[Proxy DEBUG] X-HASH-2=${xHash2}`);
    console.log(`[Proxy DEBUG] vin=${vinHeader || 'none'}, player=${playerHeader || 'none'}`);
    console.log(`[Proxy DEBUG] All headers:`, JSON.stringify(proxyHeaders, null, 2));
  }

  if (vinHeader) proxyHeaders["X-Vin-Code"] = vinHeader;
  if (playerHeader) proxyHeaders["X-Player-Identifier"] = playerHeader;

  const init = {
    method: request.method,
    headers: proxyHeaders,
  };

  if (requestBody) {
    init.body = requestBody;
  }

  // --- Direct fetch → on 429/5xx, failover to shuffled backup proxies ---

  let lastResponse = null;
  let lastData = null;
  const proxyLog = []; // Track all attempts for client-side debugging

  // Phase 1: Direct to VinFast (retry once on 5xx)
  const fetchInit = { method: init.method, headers: { ...proxyHeaders } };
  if (requestBody) fetchInit.body = requestBody;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const t0 = Date.now();
      if (attempt === 0) console.log(`[Proxy] → ${request.method} ${targetUrl}`);
      lastResponse = await fetch(targetUrl, fetchInit);
      lastData = await lastResponse.text();
      const elapsed = Date.now() - t0;
      proxyLog.push({ via: attempt === 0 ? "direct" : "direct-retry", status: lastResponse.status, ms: elapsed });
      console.log(`[Proxy] ← direct${attempt > 0 ? " retry" : ""} ${lastResponse.status} (${elapsed}ms)`);
      if (lastResponse.status < 500) break; // Success or client error → stop
      if (attempt === 0) console.warn(`[Proxy] 5xx — retrying once...`);
    } catch (e) {
      if (attempt === 1) {
        console.error(`[Proxy Error] ${request.method} /${apiPath}:`, e);
        return new Response(JSON.stringify({ error: "Internal Proxy Error" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
      proxyLog.push({ via: "direct", status: "error", error: e.message });
    }
  }

  // Phase 2: If 429 or 5xx, try backup proxies in random order
  if (lastResponse.status === 429 || lastResponse.status >= 500) {
    const runtimeEnv = locals?.runtime?.env || import.meta.env || {};

    const envKeys = [
      "BACKUP_PROXY_URL", "BACKUP_PROXY_URL_2", "BACKUP_PROXY_URL_3",
      "BACKUP_PROXY_URL_4", "BACKUP_PROXY_URL_5", "BACKUP_PROXY_URL_6",
      "BACKUP_PROXY_URL_7", "BACKUP_PROXY_URL_8", "BACKUP_PROXY_URL_9",
      "BACKUP_PROXY_URL_10", "BACKUP_PROXY_URL_11",
    ];
    const backupUrls = envKeys
      .map((k) => runtimeEnv[k] || (typeof process !== "undefined" ? process.env[k] : undefined))
      .filter(Boolean);

    // Fisher-Yates shuffle — distribute load evenly across backups
    for (let i = backupUrls.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [backupUrls[i], backupUrls[j]] = [backupUrls[j], backupUrls[i]];
    }

    for (const backupUrl of backupUrls) {
      try {
        const backupTarget = `${backupUrl.replace(/\/$/, "")}/api/vf-proxy/${apiPath}${searchStr ? "?" + searchStr : ""}`;
        // Extract short label from URL for logging
        const label = new URL(backupUrl).hostname.replace(".vercel.app", "").replace(".workers.dev", "");
        console.log(`[Proxy] 429 — failover to: ${label}`);

        const backupInit = {
          method: request.method,
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        };
        if (vinHeader) backupInit.headers["x-vin-code"] = vinHeader;
        if (playerHeader) backupInit.headers["x-player-identifier"] = playerHeader;
        if (requestBody) backupInit.body = requestBody;

        const t0 = Date.now();
        const backupResponse = await fetch(backupTarget, backupInit);
        const backupData = await backupResponse.text();
        const elapsed = Date.now() - t0;

        proxyLog.push({ via: label, status: backupResponse.status, ms: elapsed });
        console.log(`[Proxy] ← ${label} ${backupResponse.status} (${elapsed}ms)`);

        if (backupResponse.status !== 429 && backupResponse.status < 500) {
          return new Response(backupData, {
            status: backupResponse.status,
            headers: {
              "Content-Type": "application/json",
              "X-Proxy-Route": label,
              "X-Proxy-Log": JSON.stringify(proxyLog),
            },
          });
        }
      } catch (e) {
        proxyLog.push({ via: backupUrl, status: "error", error: e.message });
        console.warn(`[Proxy] Backup failed:`, e.message);
      }
    }
  }

  const servedBy = proxyLog.length > 1 ? `direct+${proxyLog.length - 1} backups (all failed)` : "direct";
  console.log(
    `[Proxy] ← ${lastResponse.status} (${lastData.length} bytes) for ${request.method} /${apiPath} [${servedBy}]`,
  );
  if (lastResponse.status >= 400) {
    console.log(`[Proxy] Error body: ${lastData.substring(0, 500)}`);
    console.log(`[Proxy DEBUG] Response headers:`, JSON.stringify(Object.fromEntries(lastResponse.headers.entries()), null, 2));
  }

  return new Response(lastData, {
    status: lastResponse.status,
    headers: {
      "Content-Type": "application/json",
      "X-Proxy-Route": "direct",
      "X-Proxy-Log": JSON.stringify(proxyLog),
    },
  });
};
