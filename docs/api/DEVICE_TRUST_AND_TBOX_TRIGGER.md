# Device Trust & T-Box Trigger — VinFast Server-Side Changes (Feb 2026)

**Date**: March 2026
**Status**: Implemented & Verified

---

## Background

In February 2026, VinFast rolled out a server-side change that broke the dashboard's ability to receive telemetry data. REST endpoints that previously worked — specifically `list_resource` and `app/ping` — began returning **HTTP 403 Forbidden** after successful MQTT connection.

By analyzing the official VinFast Android APK (decompiled), we discovered that the app performs a **device trust registration** step on every startup that the dashboard was not replicating. This step is required before the server authorizes telemetry-related requests.

---

## Root Cause

VinFast added **device-level authorization** to their connected car platform. The server now requires a registered "trusted device" before it will accept telemetry API calls. The official Android app registers itself via Firebase Cloud Messaging (FCM) token — a step that was invisible to REST-only clients.

**Without device trust**: `list_resource` → 403, `app/ping` → 403, no T-Box wake
**With device trust**: `list_resource` → 200, `app/ping` → 200, MQTT data flows normally

---

## What Was Added

### 1. Device Trust Registration

**Endpoint**: `PUT /ccarusermgnt/api/v1/device-trust/fcm-token`

The APK calls this on every app startup to register its FCM push token with VinFast's server. For the web dashboard (which has no FCM), we generate a stable pseudo-token per session.

```
PUT /ccarusermgnt/api/v1/device-trust/fcm-token
Headers: Authorization, X-HASH, X-HASH-2, VIN_ID
Body: { "fcmToken": "vfdashboard_{userId}_{timestamp}" }
Response: 200 OK
```

**Implementation**: `api.registerDeviceTrust()` in `src/services/api.js`

**Proxy update**: Added `ccarusermgnt/api/v1/device-trust` to the proxy allowlist in `src/pages/api/proxy/[...path].js`.

### 2. Set Primary Vehicle on Switch

**Endpoint**: `PUT /ccarusermgnt/api/v1/user-vehicle/set-primary-vehicle`

The APK calls this every time the user selects a different vehicle. It tells the server which vehicle's T-Box to target for subsequent wakeup and telemetry calls. Previously, the dashboard only performed MQTT reconnection on vehicle switch — missing this server-side registration.

```
PUT /ccarusermgnt/api/v1/user-vehicle/set-primary-vehicle
Headers: Authorization, X-HASH, X-HASH-2, VIN_ID
Body: { "vinCode": "{VIN}" }
Response: 200 OK
```

**Implementation**: `api.setPrimaryVehicle(vinCode)` in `src/services/api.js`, called from `switchVehicle()` in `vehicleStore.ts`.

### 3. Optimized Resource List (list_resource)

**Endpoint**: `POST /ccaraccessmgmt/api/v1/telemetry/{VIN}/list_resource`

Previously, the dashboard sent **2040 resources** (every known resource from `buildResourceList()`). The APK only sends **90 resources** — the `ScreenResources.Home` subset. Sending a smaller, targeted payload matches server expectations and avoids unnecessary overhead.

```
POST /ccaraccessmgmt/api/v1/telemetry/{VIN}/list_resource
Body: [ {objectId, instanceId, resourceId}, ... ]  // 90 items
Response: 200 OK
```

**Implementation**: `HOME_RESOURCES` constant (90 entries) in `DashboardController.jsx`, extracted from APK's `ScreenResources$Home.java`.

---

## Complete Startup Flow (Post-Fix)

After MQTT connection is established, the dashboard now mirrors the APK's startup sequence:

```
1. MQTT Connected
   ├── Heartbeat CONNECTED(2) — mqttClient sends automatically
   │
   ├── PUT  device-trust/fcm-token      → 200 (unlocks telemetry auth)
   ├── POST remote/app/wakeup            → 200 (wake T-Box from sleep)
   ├── POST telemetry/{VIN}/list_resource → 200 (register 90 home resources)
   └── POST telemetry/app/ping           → 200 (request current values)

2. MQTT messages start flowing (~72 messages in first batch)
   └── Parse deviceKey → alias → vehicleStore → UI updates
```

On **vehicle switch**, the sequence is:

```
1. PUT  user-vehicle/set-primary-vehicle  → 200 (tell server new active VIN)
2. MQTT disconnect old VIN
3. MQTT connect new VIN
4. (Same startup flow as above)
```

---

## Verification

Tested with Playwright end-to-end:

| Step                             | Result            |
| -------------------------------- | ----------------- |
| `device-trust/fcm-token`         | 200               |
| `list_resource` (90 resources)   | 200               |
| `app/ping`                       | 200               |
| MQTT messages received           | 72 in first batch |
| Dashboard renders with live data | ✅                |

---

## Files Changed

| File                                     | Change                                                                                        |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/services/api.js`                    | Added `registerDeviceTrust()`, `setPrimaryVehicle()`, fixed `appPing()` return format         |
| `src/components/DashboardController.jsx` | Added `HOME_RESOURCES` (90 entries), wired device-trust + setPrimaryVehicle into startup flow |
| `src/stores/vehicleStore.ts`             | `switchVehicle()` now calls `setPrimaryVehicle()` before MQTT reconnect                       |
| `src/pages/api/proxy/[...path].js`       | Added `ccarusermgnt/api/v1/device-trust` to proxy allowlist                                   |

---

## Notes

- The pseudo-FCM token approach works because VinFast's server validates that a device trust entry **exists**, not that the token is a valid FCM token. This may change in the future.
- `app/ping` returns metadata (battery leasing info, etc.) — real-time telemetry still flows exclusively through MQTT. The ping's value is in triggering the T-Box to push fresh data.
- The 90-resource HOME_RESOURCES list was extracted by decompiling the VinFast Android APK v2.x and reading `ScreenResources$Home.java`. If VinFast updates the app, this list may need updating.
