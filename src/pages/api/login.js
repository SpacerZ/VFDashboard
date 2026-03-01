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

export const GET = async () => {
  return new Response(
    JSON.stringify({ message: "Login API is active. Use POST to authenticate." }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};

export const POST = async ({ request, cookies, locals }) => {
  try {
    const { email, password, region, rememberMe } = await request.json();
    const regionConfig = REGIONS[region] || REGIONS["vn"];

    const auth0Url = `https://${regionConfig.auth0_domain}/oauth/token`;
    const auth0Payload = {
      client_id: regionConfig.auth0_client_id,
      audience: regionConfig.auth0_audience,
      grant_type: "password",
      // APK scope includes read:current_user + update:current_user_metadata
      // These extra scopes may add claims to the id_token that Cognito uses
      // to assign the correct IAM role with full IoT permissions.
      scope: "offline_access openid profile email read:current_user update:current_user_metadata",
      // APK sends explicit Auth0 database connection name.
      // Without this, Auth0 may route to a different connection,
      // producing an id_token with different claims/sub format.
      connection: "Username-Password-Authentication",
      username: email,
      password,
    };

    const authLog = [];

    // Phase 1: Direct to Auth0 (no retry — fail fast)
    let t0 = Date.now();
    console.log(`[Login] → Auth0 direct`);
    let response = await fetch(auth0Url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(auth0Payload),
    });
    let data = await response.json();
    let elapsed = Date.now() - t0;
    authLog.push({ via: "direct", status: response.status, ms: elapsed });
    console.log(`[Login] ← direct ${response.status} (${elapsed}ms)`);

    // Phase 2: If 429, failover through backup proxies (different IPs)
    if (response.status === 429) {
      const backupUrls = getShuffledBackups(locals);

      for (const backupUrl of backupUrls) {
        const label = labelFromUrl(backupUrl);
        try {
          const backupTarget = `${backupUrl.replace(/\/$/, "")}/api/vf-auth`;
          console.log(`[Login] 429 — failover to: ${label}`);

          t0 = Date.now();
          const backupResponse = await fetch(backupTarget, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "login", email, password, region }),
          });
          const backupData = await backupResponse.json();
          elapsed = Date.now() - t0;

          authLog.push({ via: label, status: backupResponse.status, ms: elapsed });
          console.log(`[Login] ← ${label} ${backupResponse.status} (${elapsed}ms)`);

          if (backupResponse.status !== 429) {
            response = backupResponse;
            data = backupData;
            break;
          }
        } catch (e) {
          authLog.push({ via: label, status: "error", error: e.message });
          console.warn(`[Login] Backup ${label} failed:`, e.message);
        }
      }
    }

    // Return error if still not OK
    if (!response.ok) {
      return new Response(JSON.stringify({ ...data, _authLog: authLog }), {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Calculate token expiry from Auth0's expires_in (seconds)
    const expiresIn = data.expires_in || 3600;
    const tokenExpiresAt = Date.now() + expiresIn * 1000;

    // Set Cookies — disable `secure` on localhost (HTTP) so cookies work in dev
    const isLocalhost = new URL(request.url).hostname === "localhost";
    const cookieOptions = {
      path: "/",
      httpOnly: true,
      secure: !isLocalhost,
      sameSite: "lax",
    };

    if (rememberMe) {
      cookieOptions.maxAge = 60 * 60 * 24 * 30; // 30 days
    }

    cookies.set("access_token", data.access_token, cookieOptions);
    // APK uses id_token (NOT access_token) for Cognito Federated Identities.
    // Cognito OIDC validation requires the id_token JWT (aud = client_id).
    // The access_token has aud = API URL, which Cognito may reject silently,
    // falling back to unauthenticated credentials with limited IoT policy.
    if (data.id_token) {
      cookies.set("id_token", data.id_token, cookieOptions);
    }
    if (data.refresh_token) {
      cookies.set("refresh_token", data.refresh_token, cookieOptions);
    }

    cookies.set("vf_region", region, {
      path: "/",
      httpOnly: false,
      secure: !isLocalhost,
      sameSite: "lax",
      maxAge: rememberMe ? 60 * 60 * 24 * 30 : undefined,
    });

    const servedBy = authLog.length > 1
      ? authLog[authLog.length - 1].via
      : "direct";

    return new Response(
      JSON.stringify({ success: true, region, tokenExpiresAt, _authLog: authLog }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Route": servedBy,
        },
      },
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || "Internal Server Error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
};
