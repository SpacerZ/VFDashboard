export const prerender = false;

import { REGIONS } from "../../config/vinfast";

/**
 * Collect backup proxy URLs from env, shuffle them (Fisher-Yates).
 */
function getShuffledBackups(locals) {
  const runtimeEnv = locals?.runtime?.env || import.meta.env || {};
  const envKeys = [
    "BACKUP_PROXY_URL", "BACKUP_PROXY_URL_2", "BACKUP_PROXY_URL_3",
    "BACKUP_PROXY_URL_4", "BACKUP_PROXY_URL_5", "BACKUP_PROXY_URL_6",
    "BACKUP_PROXY_URL_7", "BACKUP_PROXY_URL_8", "BACKUP_PROXY_URL_9",
    "BACKUP_PROXY_URL_10", "BACKUP_PROXY_URL_11",
  ];
  const urls = envKeys
    .map((k) => runtimeEnv[k] || (typeof process !== "undefined" ? process.env[k] : undefined))
    .filter(Boolean);

  for (let i = urls.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [urls[i], urls[j]] = [urls[j], urls[i]];
  }
  return urls;
}

function labelFromUrl(url) {
  try { return new URL(url).hostname.replace(".vercel.app", "").replace(".workers.dev", ""); }
  catch { return url; }
}

export const POST = async ({ request, cookies, locals }) => {
  try {
    const { region, rememberMe } = await request.json();

    const refreshToken = cookies.get("refresh_token")?.value;
    if (!refreshToken) {
      return new Response(
        JSON.stringify({ error: "No refresh token found" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const regionConfig = REGIONS[region] || REGIONS["vn"];
    const auth0Url = `https://${regionConfig.auth0_domain}/oauth/token`;
    const auth0Payload = {
      client_id: regionConfig.auth0_client_id,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    };

    // Phase 1: Direct to Auth0 (no retry — fail fast)
    let t0 = Date.now();
    console.log(`[Refresh] → Auth0 direct`);
    let response = await fetch(auth0Url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth0Payload),
    });
    let data = await response.json();
    let elapsed = Date.now() - t0;
    console.log(`[Refresh] ← direct ${response.status} (${elapsed}ms)`);

    // Phase 2: If 429, failover through backup proxies (different IPs)
    if (response.status === 429) {
      const backupUrls = getShuffledBackups(locals);

      for (const backupUrl of backupUrls) {
        const label = labelFromUrl(backupUrl);
        try {
          const backupTarget = `${backupUrl.replace(/\/$/, "")}/api/vf-auth`;
          console.log(`[Refresh] 429 — failover to: ${label}`);

          t0 = Date.now();
          const backupResponse = await fetch(backupTarget, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "refresh", region, refreshToken }),
          });
          const backupData = await backupResponse.json();
          elapsed = Date.now() - t0;
          console.log(`[Refresh] ← ${label} ${backupResponse.status} (${elapsed}ms)`);

          if (backupResponse.status !== 429) {
            response = backupResponse;
            data = backupData;
            break;
          }
        } catch (e) {
          console.warn(`[Refresh] Backup ${label} failed:`, e.message);
        }
      }
    }

    if (!response.ok) {
      cookies.delete("access_token", { path: "/" });
      cookies.delete("refresh_token", { path: "/" });
      return new Response(JSON.stringify(data), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Calculate token expiry
    const expiresIn = data.expires_in || 3600;
    const tokenExpiresAt = Date.now() + expiresIn * 1000;

    // Disable `secure` on localhost (HTTP) so cookies work in dev
    const isLocalhost = new URL(request.url).hostname === "localhost";
    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: "lax",
    };

    if (rememberMe) {
      cookieOptions.maxAge = 60 * 60 * 24 * 30;
    }

    cookies.set("access_token", data.access_token, cookieOptions);
    // Store id_token for Cognito OIDC validation (same as APK)
    if (data.id_token) {
      cookies.set("id_token", data.id_token, cookieOptions);
    }
    if (data.refresh_token) {
      cookies.set("refresh_token", data.refresh_token, cookieOptions);
    }

    return new Response(JSON.stringify({ success: true, tokenExpiresAt }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
