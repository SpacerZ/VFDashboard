export const prerender = false;

import { MQTT_CONFIG, DEFAULT_REGION, REGIONS } from "../../config/vinfast";
import { API_HEADERS } from "../../config/vinfast";

const COGNITO_API_VERSION = "1.1";

async function cognitoRequest(region, target, body) {
  const url = `https://cognito-identity.${region}.amazonaws.com/`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-" + COGNITO_API_VERSION,
      "X-Amz-Target": `AWSCognitoIdentityService.${target}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Cognito ${target} failed (${response.status}): ${errorText}`);
  }

  return response.json();
}

export const GET = async ({ cookies }) => {
  const accessToken = cookies.get("access_token")?.value;
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Not logged in" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // APK uses id_token (NOT access_token) for Cognito Federated Identities.
  // Cognito OIDC validation requires the id_token JWT whose "aud" matches
  // the Auth0 client_id registered as an OIDC provider in Cognito.
  // The access_token has aud = API URL, which Cognito may reject or map
  // to unauthenticated credentials with limited IoT policy.
  const idToken = cookies.get("id_token")?.value;

  const regionKey = cookies.get("vf_region")?.value || DEFAULT_REGION;
  const mqttConfig = MQTT_CONFIG[regionKey] || MQTT_CONFIG.vn;
  const regionConfig = REGIONS[regionKey] || REGIONS[DEFAULT_REGION];

  try {
    const loginProvider = mqttConfig.cognitoLoginProvider || regionConfig.auth0_domain;

    // Try id_token first (preferred, like APK). Fall back to access_token if id_token fails.
    let cognitoToken = idToken || accessToken;
    let tokenType = idToken ? "id_token" : "access_token";

    // Diagnostic: decode JWT claims to compare with APK's id_token
    if (cognitoToken) {
      try {
        const parts = cognitoToken.split(".");
        if (parts.length === 3) {
          const claims = JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/")));
          console.log(`[mqtt-credentials] JWT claims (${tokenType}):`, JSON.stringify({
            iss: claims.iss,
            sub: claims.sub,
            aud: claims.aud,
            azp: claims.azp,
            scope: claims.scope,
            exp: claims.exp,
            iat: claims.iat,
          }, null, 2));
        }
      } catch (e) {
        console.warn("[mqtt-credentials] Failed to decode JWT:", e.message);
      }
    }
    let logins = { [loginProvider]: cognitoToken };
    let identityId;
    let creds;

    try {
      // Step 1: GetId — exchange token for Cognito Identity ID
      const getIdResult = await cognitoRequest(mqttConfig.region, "GetId", {
        IdentityPoolId: mqttConfig.cognitoPoolId,
        Logins: logins,
      });
      identityId = getIdResult.IdentityId;

      // Step 2: GetCredentialsForIdentity — get temporary AWS credentials
      const credsResult = await cognitoRequest(mqttConfig.region, "GetCredentialsForIdentity", {
        IdentityId: identityId,
        Logins: logins,
      });
      creds = credsResult.Credentials;
      console.log(`[mqtt-credentials] Cognito OK with ${tokenType}, identity: ${identityId}`);
    } catch (cognitoErr) {
      // If id_token failed and we have access_token as fallback, retry
      if (tokenType === "id_token" && accessToken && accessToken !== idToken) {
        console.warn(`[mqtt-credentials] ${tokenType} failed: ${cognitoErr.message} — retrying with access_token`);
        cognitoToken = accessToken;
        tokenType = "access_token (fallback)";
        logins = { [loginProvider]: cognitoToken };

        const getIdResult = await cognitoRequest(mqttConfig.region, "GetId", {
          IdentityPoolId: mqttConfig.cognitoPoolId,
          Logins: logins,
        });
        identityId = getIdResult.IdentityId;

        const credsResult = await cognitoRequest(mqttConfig.region, "GetCredentialsForIdentity", {
          IdentityId: identityId,
          Logins: logins,
        });
        creds = credsResult.Credentials;
        console.log(`[mqtt-credentials] Cognito OK with ${tokenType}, identity: ${identityId}`);
      } else {
        throw cognitoErr;
      }
    }

    if (!identityId) {
      throw new Error("No IdentityId returned from Cognito GetId");
    }
    if (!creds) {
      throw new Error("No Credentials returned from Cognito");
    }

    // Attach policy for the identity so IoT permissions are granted before MQTT connect
    const attachPolicyResult = await attachPolicy(
      regionConfig,
      accessToken,
      identityId,
    );

    if (!attachPolicyResult.attached) {
      return new Response(
        JSON.stringify({
          error: "MQTT policy attachment failed",
          status: 412,
          policyAttached: false,
          policyMessage: attachPolicyResult.message,
          identityId,
          endpoint: mqttConfig.endpoint,
          region: mqttConfig.region,
        }),
        {
          status: 412,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(JSON.stringify({
      accessKeyId: creds.AccessKeyId,
      secretAccessKey: creds.SecretKey,
      sessionToken: creds.SessionToken,
      expiration: creds.Expiration,
      identityId,
      tokenType,
      policyAttached: attachPolicyResult.attached,
      policyMessage: attachPolicyResult.message,
      endpoint: mqttConfig.endpoint,
      region: mqttConfig.region,
    }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store, no-cache, max-age=0",
        "Pragma": "no-cache",
        Expires: "0",
      },
    });
  } catch (e) {
    console.error("[mqtt-credentials] Error:", e.message);

    const status = e.message.includes("401") || e.message.includes("NotAuthorized") ? 401 : 500;
    return new Response(JSON.stringify({ error: e.message }), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  }
};

async function attachPolicy(regionConfig, accessToken, identityId) {
  if (!identityId) {
    return { attached: false, message: "identityId missing" };
  }

  const attachPolicyUrl = `${regionConfig.api_base}/ccarusermgnt/api/v1/user-vehicle/attach-policy`;
  const body = { target: identityId };

  try {
    const response = await fetch(attachPolicyUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
        "x-service-name": API_HEADERS["X-SERVICE-NAME"] || "CAPP",
        "x-app-version": API_HEADERS["X-APP-VERSION"] || "2.17.5",
        "x-device-platform": API_HEADERS["X-Device-Platform"] || "android",
        "x-device-identifier": API_HEADERS["X-Device-Identifier"] || "",
        "x-timezone": API_HEADERS["X-Timezone"] || "Asia/Ho_Chi_Minh",
        "x-device-locale": API_HEADERS["X-Device-Locale"] || "vi-VN",
        Accept: API_HEADERS.Accept || "application/json",
      },
      body: JSON.stringify(body),
    });

    const text = await response.text();
    let payload = null;
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    console.log(`[attach-policy] ${response.status} for identity ${identityId}:`, text?.substring(0, 300));

    if (!response.ok) {
      return {
        attached: false,
        message: `attach-policy failed (${response.status}): ${text || "no body"}`,
      };
    }

    const code = Number(payload?.code);
    if (Number.isFinite(code) && code !== 200000) {
      return {
        attached: false,
        message: `attach-policy returned code ${code}: ${payload?.message || "unrecognized response"}`,
      };
    }

    return {
      attached: true,
      message: payload?.message || text || "ok",
    };
  } catch (e) {
    return { attached: false, message: `attach-policy error: ${e.message}` };
  }
}
