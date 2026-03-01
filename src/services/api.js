import { REGIONS, DEFAULT_REGION } from "../config/vinfast";

const SESSION_KEY = "vf_session";

// Buffer before token expiry to trigger proactive refresh (5 minutes)
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

class VinFastAPI {
  constructor() {
    this.region = DEFAULT_REGION;
    this.regionConfig = REGIONS[DEFAULT_REGION];
    // Tokens are now managed via HttpOnly cookies and not accessible here
    this.vin = null;
    this.userId = null;
    this.rememberMe = false;
    this.tokenExpiresAt = 0; // Tracks when access_token expires

    // Dedup: only one refresh request in-flight at a time
    this._refreshPromise = null;

    // We assume logged in if metadata cookie exists, but real check is API call
    this.isLoggedIn = false;

    // Load session on init
    this.restoreSession();
  }

  setRegion(region) {
    this.region = region;
    this.regionConfig = REGIONS[region] || REGIONS[DEFAULT_REGION];
  }

  // Cookie Helpers - Only for non-sensitive metadata
  setCookie(name, value, days) {
    if (typeof document === "undefined") return;
    let expires = "";
    const isHttps = window.location.protocol === "https:";
    if (days) {
      const date = new Date();
      date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000);
      expires = "; expires=" + date.toUTCString();
    }
    document.cookie =
      name +
      "=" +
      (encodeURIComponent(JSON.stringify(value)) || "") +
      expires +
      `; path=/; SameSite=Lax${isHttps ? "; Secure" : ""}`;
  }

  _readSessionFromStorage() {
    if (typeof window === "undefined") return null;

    try {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (!raw) return null;

      const data = JSON.parse(raw);
      if (!data || typeof data !== "object") {
        window.localStorage.removeItem(SESSION_KEY);
        return null;
      }

      if (data.expiresAt && data.expiresAt <= Date.now()) {
        window.localStorage.removeItem(SESSION_KEY);
        return null;
      }

      return data;
    } catch {
      try {
        window.localStorage.removeItem(SESSION_KEY);
      } catch {
        // ignore
      }
      return null;
    }
  }

  _writeSessionToStorage(data) {
    if (typeof window === "undefined") return;

    try {
      if (!data) {
        window.localStorage.removeItem(SESSION_KEY);
        return;
      }
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch {
      // ignore storage errors
    }
  }

  getCookie(name) {
    if (typeof document === "undefined") return null;
    const nameEQ = name + "=";
    const ca = document.cookie.split(";");
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === " ") c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) {
        try {
          return JSON.parse(
            decodeURIComponent(c.substring(nameEQ.length, c.length)),
          );
        } catch {
          return null;
        }
      }
    }
    return null;
  }

  deleteCookie(name) {
    if (typeof document === "undefined") return;
    document.cookie =
      name + "=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;";
  }

  saveSession() {
    if (typeof window === "undefined") return;
    try {
      const ttlMs = this.rememberMe
        ? 30 * 24 * 60 * 60 * 1000
        : 12 * 60 * 60 * 1000;

      const data = {
        vin: this.vin,
        userId: this.userId,
        region: this.region,
        rememberMe: this.rememberMe,
        tokenExpiresAt: this.tokenExpiresAt || 0,
        timestamp: Date.now(),
        expiresAt: Date.now() + ttlMs,
      };

      // Metadata cookie matches RememberMe duration
      this.setCookie("vf_session", data, this.rememberMe ? 30 : null);
      this._writeSessionToStorage(data);
    } catch (e) {
      console.error("Failed to save session", e);
    }
  }

  restoreSession() {
    if (typeof window === "undefined") return;
    try {
      const data =
        this.getCookie(SESSION_KEY) || this._readSessionFromStorage();
      if (data) {
        this.vin = data.vin;
        this.userId = data.userId;
        this.rememberMe = !!data.rememberMe;
        this.tokenExpiresAt = data.tokenExpiresAt || 0;
        if (data.expiresAt && data.expiresAt <= Date.now()) {
          this.clearSession();
          return;
        }
        if (data.region) this.setRegion(data.region);

        this.isLoggedIn = true; // Optimistic

        // Smart Refresh: only call Auth0 if token is close to expiry or unknown
        const now = Date.now();
        const needsRefresh =
          !this.tokenExpiresAt ||
          this.tokenExpiresAt <= now + TOKEN_REFRESH_BUFFER_MS;

        if (needsRefresh) {
          this.refreshAccessToken().catch((e) =>
            console.warn("Background refresh failed", e),
          );
        }
      } else {
        this.isLoggedIn = false;
      }
    } catch (e) {
      console.error("Failed to restore session", e);
    }
  }

  clearSession() {
    if (typeof window === "undefined") return;
    this.deleteCookie("vf_session");
    this._writeSessionToStorage(null);
    // Also trigger backend to clear HttpOnly cookies if needed?
    // Usually browser clears session cookies on close, but for explicit logout we might need an endpoint.
    // For now, client side just forgets metadata.

    this.vin = null;
    this.userId = null;
    this.rememberMe = false;
    this.tokenExpiresAt = 0;
    this.isLoggedIn = false;
  }

  _getHeaders(vinOverride = undefined) {
    // Mobile App Headers (simplified for browser CORS if needed, but keeping standard for now)
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      // Authorization is now injected by Proxy
      "x-service-name": "CAPP",
      "x-app-version": "1.10.3",
      "x-device-platform": "android",
      "x-device-family": "VFDashboard",
      "x-device-os-version": "Community",
      "x-device-locale": "vi-VN",
      "x-timezone": "Asia/Ho_Chi_Minh",
      "x-device-identifier": "vfdashboard-community-edition",
    };
    const requestVin = vinOverride ?? this.vin;
    if (requestVin) headers["x-vin-code"] = requestVin;
    if (this.userId) headers["x-player-identifier"] = this.userId;
    return headers;
  }

  async authenticate(email, password, region = "vn", rememberMe = false) {
    this.setRegion(region);
    this.rememberMe = rememberMe;

    // Use local proxy
    const url = `/api/login`;
    const payload = {
      email,
      password,
      region: this.region,
      rememberMe: this.rememberMe,
    };

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      // Log auth routing info
      if (result._authLog) {
        const log = result._authLog;
        if (log.length > 1 || response.status === 429) {
          const icon = response.status === 429 ? "🔴" : log.length > 1 ? "🟡" : "✓";
          console.group(`${icon} Auth0 login — ${log.length} attempt(s), final: ${response.status}`);
          log.forEach((entry) => {
            const color = entry.status === 429 ? "color:#ef4444" : entry.status < 400 ? "color:#4ade80" : "color:#f59e0b";
            const prefix = entry.status !== 429 && entry.status < 400 ? "✓" : "✗";
            console.log(`%c  ${prefix} ${entry.via}%c → ${entry.status} (${entry.ms || 0}ms)`, color + ";font-weight:bold", "color:#9ca3af");
          });
          console.groupEnd();
        } else if (log.length === 1) {
          console.log(`%c✓ Auth0 login%c → direct (${log[0]?.ms || 0}ms)`, "color:#4ade80;font-weight:bold", "color:#9ca3af");
        }
      }

      if (!response.ok) {
        let errorMessage = "An unexpected error occurred. Please try again.";
        if (result && result.message) {
          errorMessage = result.message;
        }

        if (response.status === 401) {
          errorMessage =
            "Incorrect email or password. Please check your credentials.";
        } else if (response.status === 403) {
          errorMessage =
            "Access denied. Your account may be locked or restricted.";
        } else if (response.status === 429) {
          errorMessage = "Too many attempts. Please try again later.";
        } else if (response.status >= 500) {
          errorMessage = "VinFast server error. Please try again later.";
        }

        throw new Error(errorMessage);
      }

      // Store token expiry from server for smart refresh
      if (result.tokenExpiresAt) {
        this.tokenExpiresAt = result.tokenExpiresAt;
      }

      this.isLoggedIn = true;
      this.saveSession();

      return { success: true };
    } catch (error) {
      console.error("Auth Error:", error);
      throw error;
    }
  }

  async refreshAccessToken() {
    // Dedup: if a refresh is already in-flight, reuse the same promise
    if (this._refreshPromise) {
      return this._refreshPromise;
    }

    this._refreshPromise = this._doRefresh();
    try {
      return await this._refreshPromise;
    } finally {
      this._refreshPromise = null;
    }
  }

  async _doRefresh() {
    try {
      const response = await fetch("/api/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          region: this.region,
          rememberMe: this.rememberMe,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        // Update token expiry from server response
        if (result.tokenExpiresAt) {
          this.tokenExpiresAt = result.tokenExpiresAt;
        }
        this.saveSession();
        return true;
      } else {
        return false;
      }
    } catch (e) {
      console.error("Refresh token error:", e);
      return false;
    }
  }

  async _fetchWithRetry(url, options = {}) {
    // Inject headers
    options.headers = options.headers || this._getHeaders();

    let response = await fetch(url, options);

    // Log proxy routing info from server headers
    this._logProxyRoute(url, response);

    if (response.status === 401) {
      console.warn("Received 401. Trying to refresh token...");
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        response = await fetch(url, options);
        this._logProxyRoute(url, response);
      } else {
        this.clearSession();
        window.location.href = "/login";
        throw new Error("Session expired");
      }
    }

    // Note: 429 failover is handled server-side in the proxy ([...path].js)
    // via BACKUP_PROXY_URL env var. No client-side fallback needed since
    // access_token is in HttpOnly cookies (not accessible to client JS).

    return response;
  }

  _logProxyRoute(url, response) {
    try {
      const route = response.headers.get("x-proxy-route");
      const logRaw = response.headers.get("x-proxy-log");
      if (!route && !logRaw) return;

      const shortUrl = url.replace(/\?.*$/, "").replace("/api/proxy/", "");
      const status = response.status;

      if (logRaw) {
        const log = JSON.parse(logRaw);
        if (log.length <= 1 && status < 400) {
          // Direct success — minimal log
          console.log(`%c✓ ${shortUrl}%c → direct (${log[0]?.ms || 0}ms)`, "color:#4ade80;font-weight:bold", "color:#9ca3af");
        } else {
          // Failover happened — detailed log
          const icon = status === 429 ? "🔴" : "🟡";
          console.group(`${icon} ${shortUrl} — ${log.length} attempt(s), final: ${status}`);
          log.forEach((entry, i) => {
            const statusColor = entry.status === 429 ? "color:#ef4444" : entry.status < 400 ? "color:#4ade80" : "color:#f59e0b";
            const prefix = i === log.length - 1 && entry.status !== 429 ? "✓" : "✗";
            console.log(
              `%c  ${prefix} ${entry.via}%c → ${entry.status} (${entry.ms || 0}ms)`,
              statusColor + ";font-weight:bold",
              "color:#9ca3af"
            );
          });
          console.groupEnd();
        }
      } else if (route) {
        console.log(`[Proxy] ${shortUrl} via ${route} → ${status}`);
      }
    } catch {
      // Ignore logging errors
    }
  }

  async getVehicles() {
    // Proxy user-vehicle
    // Original: ${this.regionConfig.api_base}/ccarusermgnt/api/v1/user-vehicle
    const proxyPath = `ccarusermgnt/api/v1/user-vehicle`;
    const url = `/api/proxy/${proxyPath}?region=${this.region}`;

    const response = await this._fetchWithRetry(url);
    if (!response.ok) throw new Error("Failed to fetch vehicles");

    const json = await response.json();

    if (json.data && json.data.length > 0) {
      // Auto-select first vehicle
      this.vin = json.data[0].vinCode;
      this.userId = json.data[0].userId;
      this.saveSession();
    }
    return json.data || [];
  }

  async getUserProfile() {
    // Use new proxy endpoint that supports cookie auth
    const url = `/api/user?region=${this.region}`;
    const response = await this._fetchWithRetry(url);

    if (!response.ok) {
      throw new Error(`Failed to fetch user profile: ${response.status}`);
    }

    return await response.json();
  }

  // --- Device Trust Registration ---

  /**
   * PUT ccarusermgnt/api/v1/device-trust/fcm-token
   * APK calls this on EVERY startup (HomePreloadViewModel → PutDeviceTokenUseCase).
   * Registers the device's push notification token with VinFast.
   * The "device-trust" name suggests this may affect server-side authorization
   * for telemetry endpoints (list_resource, app/ping).
   *
   * For web dashboard, we generate a stable pseudo-token since we can't use FCM.
   */
  async registerDeviceTrust() {
    const proxyPath = `ccarusermgnt/api/v1/device-trust/fcm-token`;
    const url = `/api/proxy/${proxyPath}?region=${this.region}`;

    // Generate a stable pseudo-FCM token for this browser session.
    // Real FCM tokens are ~200 chars. We use a deterministic token based on
    // user + device identifier so the server sees a consistent "device".
    const pseudoToken = `vfdashboard_${this.userId || 'anon'}_${Date.now()}`;

    try {
      const response = await this._fetchWithRetry(url, {
        method: "PUT",
        headers: this._getHeaders(),
        body: JSON.stringify({ fcmToken: pseudoToken }),
      });

      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      console.log(
        `%c[device-trust] ${response.status}`,
        response.ok ? 'color:#10b981;font-weight:bold' : 'color:#ef4444;font-weight:bold',
        json || text,
      );
      return { status: response.status, data: json };
    } catch (e) {
      console.warn('[device-trust] Failed:', e.message);
      return { status: 0, error: e.message };
    }
  }


  // --- Telemetry Trigger (app/ping) ---

  /**
   * POST ccaraccessmgmt/api/v1/telemetry/app/ping
   * APK calls this to "ping" the T-Box and get current telemetry values.
   * Body: [{objectId, instanceId, resourceId}, ...]
   * Response: {data: [{deviceKey, value, lastUpdateTime}, ...]}
   */
  async appPing(resources) {
    const proxyPath = `ccaraccessmgmt/api/v1/telemetry/app/ping`;
    const url = `/api/proxy/${proxyPath}?region=${this.region}`;

    const response = await this._fetchWithRetry(url, {
      method: "POST",
      headers: this._getHeaders(),
      body: JSON.stringify(resources),
    });

    const text = await response.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}
    console.log(`[appPing] ${response.status}`, json || text);
    return { status: response.status, data: json };
  }

  /**
   * POST ccaraccessmgmt/api/v1/telemetry/{vin}/list_resource
   * APK calls this after subscribing to register which resources to push.
   * Body: [{objectId, instanceId, resourceId}, ...]
   */
  async listResource(vin, resources) {
    const requestVin = vin || this.vin;
    if (!requestVin) throw new Error("VIN required");

    const proxyPath = `ccaraccessmgmt/api/v1/telemetry/${requestVin}/list_resource`;
    const url = `/api/proxy/${proxyPath}?region=${this.region}`;

    const response = await this._fetchWithRetry(url, {
      method: "POST",
      headers: this._getHeaders(requestVin),
      body: JSON.stringify(resources),
    });

    const json = await response.json();
    console.log(`[listResource] ${response.status}`, json);
    return { status: response.status, ...json };
  }

  // --- T-Box Wakeup ---

  /**
   * POST ccaraccessmgmt/api/v1/remote/app/wakeup
   * APK calls this to explicitly wake the T-Box.
   * No body/parameters — simple POST.
   */
  async wakeupTBox() {
    const proxyPath = `ccaraccessmgmt/api/v1/remote/app/wakeup`;
    const url = `/api/proxy/${proxyPath}?region=${this.region}`;

    try {
      const response = await this._fetchWithRetry(url, {
        method: "POST",
        headers: this._getHeaders(),
        body: JSON.stringify({}),
      });

      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      console.log(
        `%c[wakeup] ${response.status}`,
        response.ok ? "color:#10b981;font-weight:bold" : "color:#ef4444;font-weight:bold",
        json || text,
      );
      return { status: response.status, data: json };
    } catch (e) {
      console.warn("[wakeup] Failed:", e.message);
      return { status: 0, error: e.message };
    }
  }

  /**
   * PUT ccarusermgnt/api/v1/user-vehicle/set-primary-vehicle
   * APK calls this when switching vehicles to tell the server which vehicle is active.
   * Required before wakeup/list_resource will target the correct T-Box.
   */
  async setPrimaryVehicle(vinCode) {
    if (!vinCode) throw new Error("VIN required");
    const proxyPath = `ccarusermgnt/api/v1/user-vehicle/set-primary-vehicle`;
    const url = `/api/proxy/${proxyPath}?region=${this.region}`;

    try {
      const response = await this._fetchWithRetry(url, {
        method: "PUT",
        headers: this._getHeaders(vinCode),
        body: JSON.stringify({ vinCode }),
      });

      const text = await response.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      console.log(
        `%c[setPrimaryVehicle] ${response.status}`,
        response.ok ? "color:#10b981;font-weight:bold" : "color:#ef4444;font-weight:bold",
        json || text,
      );
      return { status: response.status, data: json };
    } catch (e) {
      console.warn("[setPrimaryVehicle] Failed:", e.message);
      return { status: 0, error: e.message };
    }
  }

  // --- Full Telemetry Methods ---

  async getAliases(vin, version = "1.0") {
    if (vin) this.vin = vin;
    if (!this.vin) throw new Error("VIN is required");

    const proxyPath = `modelmgmt/api/v2/vehicle-model/mobile-app/vehicle/get-alias`;
    const url = `/api/proxy/${proxyPath}?region=${this.region}&version=${version}`;

    const response = await this._fetchWithRetry(url);
    if (!response.ok) throw new Error("Failed to fetch aliases");

    const json = await response.json();
    let resources = [];

    // Robust parsing logic
    if (json.data && json.data.resources) {
      resources = json.data.resources;
    } else if (json.data && json.data.data && json.data.data.resources) {
      resources = json.data.data.resources;
    } else if (Array.isArray(json.data)) {
      resources = json.data;
    } else if (Array.isArray(json.resources)) {
      resources = json.resources;
    } else if (Array.isArray(json)) {
      resources = json;
    }

    if (resources.length === 0) {
      console.warn("getAliases: No resources found in response:", json);
      // Handle business-logic 401 (sometimes in body with 200 OK)
      if (json.code === 401000 || json.message?.includes("expired")) {
        this.clearSession();
        window.location.href = "/login";
        throw new Error("Session expired (API Code 401000)");
      }
    }

    return resources;
  }

  // --- Charging Station API ---

  async searchChargingStations(latitude, longitude, excludeFavorite = false) {
    const proxyPath = `ccarcharging/api/v1/stations/search`;
    const url = `/api/proxy/${proxyPath}?region=${this.region}`;

    const response = await this._fetchWithRetry(url, {
      method: "POST",
      body: JSON.stringify({ latitude, longitude, excludeFavorite }),
    });

    if (!response.ok) throw new Error("Failed to search charging stations");
    const json = await response.json();
    return json.data || json;
  }

  // --- Charging History API ---
  // Endpoint: POST /ccarcharging/api/v1/charging-sessions/search?page=N&size=N
  // Body: {"orderStatus":[3,5,7]} (3=completed, 5=failed, 7=cancelled)

  async getChargingHistory(page = 0, size = 20, vinOverride = null) {
    const requestVin = vinOverride ?? this.vin;
    if (!requestVin) throw new Error("VIN is required");
    const proxyPath = `ccarcharging/api/v1/charging-sessions/search`;
    const url = `/api/proxy/${proxyPath}?region=${this.region}&page=${page}&size=${size}`;

    const response = await this._fetchWithRetry(url, {
      method: "POST",
      headers: this._getHeaders(requestVin),
      body: JSON.stringify({ orderStatus: [3, 5, 7] }),
    });
    if (!response.ok) throw new Error("Failed to fetch charging history");
    const json = await response.json();

    // Return full JSON: { code, message, data: [...sessions], metadata: { totalRecords } }
    return json;
  }

  // --- External Integrations (Weather/Map) ---

  async fetchLocationName(lat, lon) {
    if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
      // Nominatim requires a User-Agent, browsers send one automatically but let's be polite if possible
      const res = await fetch(url, {
        headers: {
          "User-Agent": "VFDashboard/2.0",
        },
      });
      if (res.ok) {
        const data = await res.json();
        const a = data.address || {};
        const strip = (s) =>
          s
            ? s
                .replace(/^(Thành phố|Tỉnh|Quận|Huyện|Xã|Phường)\s+/gi, "")
                .trim()
            : s;

        const rawDistrict = a.city_district || a.district || a.county;
        const rawCity = a.city || a.town || a.village || a.state || a.province;

        return {
          location_address: [
            strip(rawDistrict),
            strip(rawCity),
            (a.country_code || "VN").toUpperCase(),
          ]
            .filter(Boolean)
            .join(", "),
          weather_address: [
            strip(rawCity),
            (a.country_code || "VN").toUpperCase(),
          ]
            .filter(Boolean)
            .join(", "),
        };
      }
    } catch (e) {
      console.warn("Location fetch failed", e);
    }
    return null;
  }

  async fetchWeather(lat, lon) {
    if (lat === null || lat === undefined || lon === null || lon === undefined) return null;
    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`;
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        return data.current_weather;
      }
    } catch (e) {
      console.warn("Weather fetch failed", e);
    }
    return null;
  }

  // --- KV Known-Good Aliases ---

  async getKnownAliases(model, year) {
    try {
      const params = new URLSearchParams({ model });
      if (year) params.set("year", String(year));
      const response = await fetch(`/api/known-aliases?${params}`);
      if (!response.ok) return { aliases: [], source: "error" };
      return await response.json();
    } catch (e) {
      console.warn("getKnownAliases failed:", e);
      return { aliases: [], source: "error" };
    }
  }

  async reportKnownAliases(model, year, aliases, discoveredBy) {
    try {
      const response = await fetch("/api/known-aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, year, aliases, discoveredBy }),
      });
      if (!response.ok) return { success: false };
      return await response.json();
    } catch (e) {
      console.warn("reportKnownAliases failed:", e);
      return { success: false };
    }
  }

}

export const api = new VinFastAPI();
