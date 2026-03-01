import { map, atom } from "nanostores";
import { api } from "../services/api";
import { DEFAULT_LOCATION } from "../constants/vehicle";
import { getMqttClient } from "../services/mqttClient";

export interface VehicleInfo {
  vinCode: string;
  marketingName?: string;
  vehicleVariant?: string; // e.g., "PLUS"
  color?: string; // Hex or Name
  exteriorColor?: string;
  interiorColor?: string;
  yearOfProduct?: number;
  vehicleName?: string;
  customizedVehicleName?: string;
  userVehicleType?: string; // "OWNER" etc.
  vehicleImage?: string;
  profileImage?: string;
  warrantyExpirationDate?: string | null;
  warrantyMileage?: number | null;
  batteryCapacity?: number | null; // kWh
  vehicleAliasVersion?: string;
}

export interface VehicleState {
  // Store Metadata
  vehicles: VehicleInfo[]; // List of all available vehicles
  vehicleCache: Record<string, Partial<VehicleState>>; // Cache for switched vehicles

  battery_level: number | null;
  range: number | null;
  odometer: number | null;
  charging_status: number | boolean;
  speed: number | null;
  // Location
  latitude: number;
  longitude: number;

  // Display Info
  vin: string | null;
  model: string;
  trim: string;
  user_name: string;
  user_avatar: string;
  vinfast_profile_image?: string; // Authoritative image from User-Vehicle API

  // Extended Header Info
  marketingName?: string;
  vehicleVariant?: string;
  color?: string;
  yearOfProduct?: number;
  customizedVehicleName?: string;
  userVehicleType?: string;
  vehicleImage?: string; // Link image from API
  manufacturer?: string;
  interiorColor?: string;

  // Climate
  outside_temp?: number | null;
  weather_outside_temp?: number | null;
  inside_temp?: number | null; // From Telemetry
  fan_speed?: number | null;
  weather_code?: number | null;
  location_address?: string;
  weather_address?: string;

  // ECU
  bms_version?: string;
  gateway_version?: string;
  ecu_head_unit?: string;
  ecu_tailgate?: string;
  ecu_door_control?: string;
  ecu_seat_control?: string;

  ignition_status?: number | string | null;
  heading?: number;

  // Detailed Versions
  mhu_version?: string;
  vcu_version?: string;
  bcm_version?: string;

  // Vehicle Status
  firmware_version?: string;
  tbox_version?: string;
  thermal_warning?: string | number; // 1 = Warning, 0 = Normal
  service_alert?: string | number;
  next_service_mileage?: number | null;
  next_service_date?: string | null;
  service_appointment_id?: string | null;
  service_appointment_status?: string | null;

  // Driving Stats
  central_lock_status?: boolean; // True=Locked?
  handbrake_status?: boolean; // True=Engaged
  window_status?: string | number; // Window state

  // Warranty
  warrantyExpirationDate?: string | null;
  warrantyMileage?: number | null;

  // Doors
  door_fl?: boolean;
  door_fr?: boolean;
  door_rl?: boolean;
  door_rr?: boolean;
  trunk_status?: boolean;
  hood_status?: boolean;
  // Tires (Bar/kPa and Temp)
  tire_pressure_fl?: number | null;
  tire_pressure_fr?: number | null;
  tire_pressure_rl?: number | null;
  tire_pressure_rr?: number | null;
  tire_temp_fl?: number | null;
  tire_temp_fr?: number | null;
  tire_temp_rl?: number | null;
  tire_temp_rr?: number | null;

  // Control / Status
  gear_position?: string | null; // P, R, N, D, S
  is_locked?: boolean | null;

  // Climate Details
  climate_driver_temp?: number | null;
  climate_passenger_temp?: number | null;

  // Module C - Battery Details
  target_soc?: number | null;
  remaining_charging_time?: number | null;
  battery_health_12v?: string | null; // OK/Low
  soh_percentage?: number | null;
  battery_capacity_kwh?: number | null; // From user-vehicle API
  battery_nominal_capacity_kwh?: number | null; // From telemetry alias
  battery_type?: string;
  battery_serial?: string | null;
  battery_manufacture_date?: string | null;
  // Full Telemetry Cache
  fullTelemetryData: Record<string, any[]>; // VIN -> Raw Array
  fullTelemetryAliases: Record<string, any[]>; // VIN -> Alias Array
  fullTelemetryTimestamps: Record<string, number>; // VIN -> Timestamp
  isScanning: boolean;
  debugLog?: any[]; // For storing deep scan candidates
  debugLogByVin?: Record<string, any[]>;

  lastUpdated: number;
  odoLastReceived?: number; // Timestamp when odometer value was last received from MQTT
  isRefreshing?: boolean;
  isInitialized?: boolean;
  isEnriching?: boolean; // True when fetching Location/Weather externally
  dataSource?: "cache" | "live" | "none"; // Whether displayed data is from cache or live MQTT
}

// Demo Mode / Default State
export const vehicleStore = map<VehicleState>({
  vehicles: [],
  vehicleCache: {},

  vin: null,
  model: "",
  trim: "",
  user_name: "",
  user_avatar: "",

  battery_level: null,
  range: null,
  odometer: null,
  charging_status: false,
  speed: null,
  latitude: DEFAULT_LOCATION.LATITUDE,
  longitude: DEFAULT_LOCATION.LONGITUDE,

  // Control
  gear_position: null,
  is_locked: null,

  // Climate
  climate_driver_temp: null,
  climate_passenger_temp: null,
  fan_speed: null,
  outside_temp: null,
  inside_temp: null,

  // Tires
  tire_pressure_fl: null,
  tire_temp_fl: null,
  tire_pressure_fr: null,
  tire_temp_fr: null,
  tire_pressure_rl: null,
  tire_temp_rl: null,
  tire_pressure_rr: null,
  tire_temp_rr: null,

  // Doors (Closed)
  door_fl: false,
  door_fr: false,
  door_rl: false,
  door_rr: false,
  trunk_status: false,
  hood_status: false,

  // New Status
  handbrake_status: false,
  window_status: undefined,

  // Battery Details (Module C)
  target_soc: null,
  remaining_charging_time: null,
  soh_percentage: null,
  battery_health_12v: null,
  battery_capacity_kwh: null,
  battery_nominal_capacity_kwh: null,
  battery_type: "--",
  battery_serial: null,
  battery_manufacture_date: null,

  // ECU
  bms_version: "--",
  gateway_version: "--",
  ecu_head_unit: "--",

  ignition_status: null,
  heading: 0,

  mhu_version: "--",
  vcu_version: "--",
  bcm_version: "--",

  central_lock_status: undefined,

  // Warranty
  warrantyExpirationDate: null,
  warrantyMileage: null,

  // Vehicle Status
  firmware_version: "--",
  tbox_version: "--",
  thermal_warning: 0,
  service_alert: 0,
  next_service_mileage: null,
  next_service_date: null,
  service_appointment_id: null,
  service_appointment_status: null,

  // Full Telemetry Cache
  fullTelemetryData: {},
  fullTelemetryAliases: {},
  fullTelemetryTimestamps: {},
  isScanning: false,
  debugLog: [],
  debugLogByVin: {},

  lastUpdated: Date.now(),
  odoLastReceived: undefined,
  isRefreshing: false,
  isInitialized: false,
  isEnriching: false,
  dataSource: "none",
});

// Reactive version counter — bumped every time MQTT snapshot receives new data.
// TelemetryDrawer subscribes to re-read snapshot and fill groups progressively.
export const mqttSnapshotVersion = atom(0);

const locationEnrichInFlight = new Map<string, Promise<void>>();
const locationEnrichState = new Map<
  string,
  { lat: number; lon: number; lastAttemptAt: number }
>();

type MqttTelemetryCatalogEntry = {
  keys: string[];
  lastUpdated: number;
};

const mqttRawTelemetryByVin = new Map<string, Map<string, any>>();
const mqttTelemetryCatalog = new Map<string, MqttTelemetryCatalogEntry>();
const MQTT_TELEMETRY_CATALOG_STORAGE_KEY = "vf-mqtt-telemetry-catalog:v1";
const MQTT_TELEMETRY_CATALOG_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const sleepMs = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Singleton flag — load from localStorage at most once per session
let _catalogLoadedFromStorage = false;

const loadMqttTelemetryCatalog = (): void => {
  if (typeof window === "undefined") return;
  if (_catalogLoadedFromStorage) return; // Already loaded this session

  _catalogLoadedFromStorage = true;

  try {
    const raw = window.localStorage.getItem(MQTT_TELEMETRY_CATALOG_STORAGE_KEY);
    if (!raw) return;

    const parsed = JSON.parse(raw) as Record<string, MqttTelemetryCatalogEntry>;
    const now = Date.now();

    Object.entries(parsed || {}).forEach(([vin, entry]) => {
      const keys = Array.isArray(entry?.keys) ? entry.keys : [];
      const lastUpdated =
        typeof entry?.lastUpdated === "number" ? entry.lastUpdated : now;
      const isFresh = now - lastUpdated <= MQTT_TELEMETRY_CATALOG_TTL_MS;
      if (!vin || !keys.length || !isFresh) return;
      mqttTelemetryCatalog.set(vin, {
        keys: [...new Set(keys.map((k) => String(k)))],
        lastUpdated,
      });
    });
  } catch (error) {
    console.warn("Failed to load MQTT telemetry catalog", error);
  }
};

const persistMqttTelemetryCatalog = () => {
  if (typeof window === "undefined") return;

  try {
    const payload = JSON.stringify(
      Object.fromEntries(
        [...mqttTelemetryCatalog.entries()].map(([vin, entry]) => [
          vin,
          {
            keys: entry.keys,
            lastUpdated: entry.lastUpdated,
          },
        ]),
      ),
    );
    window.localStorage.setItem(MQTT_TELEMETRY_CATALOG_STORAGE_KEY, payload);
  } catch (error) {
    console.warn("Failed to persist MQTT telemetry catalog", error);
  }
};

const setCachedTelemetryKeys = (vin: string, keys: Iterable<string>) => {
  if (!vin) return;

  loadMqttTelemetryCatalog();
  mqttTelemetryCatalog.set(vin, {
    keys: [...new Set(keys)].sort(),
    lastUpdated: Date.now(),
  });
  persistMqttTelemetryCatalog();
};

const getCachedTelemetryKeys = (vin: string): string[] => {
  if (!vin) return [];

  loadMqttTelemetryCatalog();
  const entry = mqttTelemetryCatalog.get(vin);
  if (!entry || !entry.keys.length) return [];
  const now = Date.now();
  if (now - entry.lastUpdated > MQTT_TELEMETRY_CATALOG_TTL_MS) return [];
  return entry.keys;
};

const clearCachedTelemetryCatalog = (vin?: string) => {
  if (vin) {
    mqttTelemetryCatalog.delete(vin);
    persistMqttTelemetryCatalog();
    return;
  }

  mqttTelemetryCatalog.clear();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(MQTT_TELEMETRY_CATALOG_STORAGE_KEY);
  }
};

// Fast parseInt: avoid String() coercion for already-string/number values
const fastNormInt = (v: any, fallback: string): string => {
  if (v === null || v === undefined || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  return n === n && Number.isFinite(n) ? String(n | 0) : fallback; // n|0 truncates to int
};

const normalizeTelemetryKey = (item: any): string => {
  if (!item || typeof item !== "object") return "";

  // Fast path: deviceKey string (most common from MQTT)
  const dk = item.deviceKey;
  if (dk) {
    const s = typeof dk === "string" ? dk : String(dk);
    // Quick check for 3-part key: skip trim/replace when possible
    const sep = s.indexOf("/") >= 0 ? "/" : "_";
    const p0end = s.indexOf(sep);
    if (p0end > 0) {
      const p1end = s.indexOf(sep, p0end + 1);
      if (p1end > p0end) {
        const oid = fastNormInt(s.substring(0, p0end), "");
        const iid = fastNormInt(s.substring(p0end + 1, p1end), "0");
        const rid = fastNormInt(s.substring(p1end + 1), "");
        if (oid && rid) return `${oid}|${iid}|${rid}`;
      }
    }
  }

  // Fallback: field-level extraction
  const objectId = item.objectId ?? item.object_id ?? item.oid;
  const resourceId = item.resourceId ?? item.resource_id ?? item.rid;
  if (objectId && resourceId) {
    const instanceId = item.instanceId ?? item.instance_id ?? item.iid ?? "0";
    return `${fastNormInt(objectId, "")}|${fastNormInt(instanceId, "0")}|${fastNormInt(resourceId, "")}`;
  }

  return "";
};

const ingestMqttTelemetry = (vin: string, messages: any[]) => {
  if (!vin || !Array.isArray(messages) || messages.length === 0) return;
  loadMqttTelemetryCatalog();

  let bucket = mqttRawTelemetryByVin.get(vin);
  if (!bucket) {
    bucket = new Map<string, any>();
    mqttRawTelemetryByVin.set(vin, bucket);
  }

  const discoveredKeys = new Set<string>();

  const now = Date.now();
  for (const item of messages) {
    const key = normalizeTelemetryKey(item);
    if (!key) continue;

    const [objectId, instanceId, resourceId] = key.split("|");
    const deviceKey = `${objectId}_${instanceId}_${resourceId}`;
    if (!item || typeof item !== "object") continue;

    bucket.set(key, {
      ...item,
      objectId,
      instanceId,
      resourceId,
      deviceKey,
      lastUpdated: item.timestamp || now,
    });

    discoveredKeys.add(key);
  }

  if (discoveredKeys.size > 0) {
    const existing = mqttRawTelemetryByVin.get(vin);
    const finalKeys = new Set<string>(discoveredKeys);
    if (existing) {
      existing.forEach((_item, key) => finalKeys.add(key));
    }
    setCachedTelemetryKeys(vin, finalKeys);

    // Bump reactive version so TelemetryDrawer can progressively fill groups
    mqttSnapshotVersion.set(mqttSnapshotVersion.get() + 1);
  }

};

const getRawMqttTelemetry = (vin: string) => {
  const bucket = mqttRawTelemetryByVin.get(vin);
  if (!bucket) return [];
  return [...bucket.values()];
};


const LOCATION_ENRICH_TTL_MS = 3 * 60 * 1000;
const LOCATION_ENRICH_DISTANCE_M = 500;
const LOCATION_ENRICH_TIMEOUT_MS = 5000;

const toCoordNumber = (value: any): number | null => {
  const valueNum = typeof value === "number" ? value : Number(value);
  return Number.isFinite(valueNum) ? valueNum : null;
};

const isValidCoordPair = (
  latitude: number | null,
  longitude: number | null,
): latitude is number => {
  if (latitude == null || longitude == null) return false;
  if (latitude < -90 || latitude > 90) return false;
  if (longitude < -180 || longitude > 180) return false;
  return true;
};

const haversineMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.min(1, Math.sqrt(a)));
};

const shouldEnrichLocationWeather = (
  vin: string,
  latitude: number,
  longitude: number,
  force = false,
) => {
  if (force) return true;

  const now = Date.now();
  const latest = locationEnrichState.get(vin);
  if (!latest) return true;
  if (now - latest.lastAttemptAt > LOCATION_ENRICH_TTL_MS) return true;

  const movedMeters = haversineMeters(
    latest.lat,
    latest.lon,
    latitude,
    longitude,
  );
  return movedMeters >= LOCATION_ENRICH_DISTANCE_M;
};

const enrichLocationAndWeather = async (
  vin: string,
  latitude: number,
  longitude: number,
  force = false,
) => {
  if (!isValidCoordPair(latitude, longitude)) return;
  if (!shouldEnrichLocationWeather(vin, latitude, longitude, force)) return;

  const existing = locationEnrichInFlight.get(vin);
  if (existing) return existing;

  const task = (async () => {
    const now = Date.now();
    const activeState = vehicleStore.get();
    const isActiveVin = activeState.vin === vin;
    if (isActiveVin) {
      vehicleStore.setKey("isEnriching", true);
    }

    const timeout = (ms: number) =>
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("External enrichment timeout")), ms),
      );

    try {
      const [geoResult, weatherResult] = await Promise.allSettled([
        Promise.race([
          api.fetchLocationName(latitude, longitude),
          timeout(LOCATION_ENRICH_TIMEOUT_MS),
        ]),
        Promise.race([
          api.fetchWeather(latitude, longitude),
          timeout(LOCATION_ENRICH_TIMEOUT_MS),
        ]),
      ]);

      const updatePayload: Partial<VehicleState> = { vin };
      if (geoResult.status === "fulfilled" && geoResult.value) {
        const geo = geoResult.value;
        if (geo.location_address) updatePayload.location_address = geo.location_address;
        if (geo.weather_address) updatePayload.weather_address = geo.weather_address;
      }

      if (weatherResult.status === "fulfilled" && weatherResult.value) {
        const weather = weatherResult.value;
        if (weather.temperature !== undefined) {
          updatePayload.weather_outside_temp = Number(weather.temperature);
        }
        if (weather.weathercode !== undefined) {
          updatePayload.weather_code = Number(weather.weathercode);
        }
      }

      if (Object.keys(updatePayload).length > 1) {
        updateVehicleData(updatePayload);
      }

      locationEnrichState.set(vin, {
        lat: latitude,
        lon: longitude,
        lastAttemptAt: now,
      });
    } catch (e) {
      locationEnrichState.set(vin, {
        lat: latitude,
        lon: longitude,
        lastAttemptAt: now,
      });
    } finally {
      locationEnrichInFlight.delete(vin);
      if (vehicleStore.get().vin === vin) {
        vehicleStore.setKey("isEnriching", false);
      }
    }
  })();

  locationEnrichInFlight.set(vin, task);
  return task;
};

type VehicleDataUpdateOptions = {
  skipNullValues?: boolean;
};

export const updateVehicleData = (
  data: Partial<VehicleState>,
  options: VehicleDataUpdateOptions = {},
) => {
  const sanitize = (
    incoming: Partial<VehicleState>,
    skipNullValues = false,
  ): Partial<VehicleState> => {
    const result: Partial<VehicleState> = {};
    Object.entries(incoming).forEach(([rawKey, value]) => {
      const key = rawKey as keyof VehicleState;

      // Ignore undefined values so partial payloads (common with REST app/ping)
      // do not wipe fields maintained by live MQTT.
      if (value === undefined) return;
      // During REST-refresh flows, treat null as "no signal" for optional signals,
      // while still allowing explicit MQTT null values when passed directly.
      if (skipNullValues && value === null) return;

      result[key] = value;
    });
    return result;
  };

  const current = vehicleStore.get();
  const { skipNullValues = false } = options;

  // We expect 'vin' to be provided in 'data' for robust handling.
  // If not provided, we fallback to current.vin, but this is risky for background updates.
  const incoming = sanitize(data, skipNullValues);
  const targetVin = incoming.vin || current.vin;

  if (!targetVin) return;

  // Ensure lastUpdated is present for cache consistency
  const timestamp =
    incoming.lastUpdated && Number.isFinite(incoming.lastUpdated as number)
      ? incoming.lastUpdated
      : Date.now();
  const dataToCache = { ...incoming, lastUpdated: timestamp };

  // 1. Update Cache
  const latest = vehicleStore.get();
  const currentCache = latest.vehicleCache[targetVin] || {};
  const newCacheEntry = { ...currentCache, ...dataToCache };
  const newVehicleCache = {
    ...latest.vehicleCache,
    [targetVin]: newCacheEntry,
  };

  // 2. Update Store — use setKey() to avoid spreading 80+ field objects
  if (targetVin === latest.vin) {
    // Active vehicle: update individual telemetry keys + cache
    for (const [key, val] of Object.entries(dataToCache)) {
      if (val !== undefined) {
        (vehicleStore as any).setKey(key, val);
      }
    }
    vehicleStore.setKey("vehicleCache" as any, newVehicleCache);
  } else {
    // Background vehicle: only update the cache
    vehicleStore.setKey("vehicleCache" as any, newVehicleCache);
  }
};

// Initial State (Clean Slate for Resetting)
const INITIAL_TELEMETRY: Partial<VehicleState> = {
  battery_level: null,
  range: null,
  odometer: null,
  charging_status: false,
  speed: null,
  latitude: DEFAULT_LOCATION.LATITUDE,
  longitude: DEFAULT_LOCATION.LONGITUDE,

  // Control
  gear_position: null,
  is_locked: null,

  // Climate
  climate_driver_temp: null,
  climate_passenger_temp: null,
  fan_speed: null,
  outside_temp: null,
  inside_temp: null,

  // Tires
  tire_pressure_fl: null,
  tire_temp_fl: null,
  tire_pressure_fr: null,
  tire_temp_fr: null,
  tire_pressure_rl: null,
  tire_temp_rl: null,
  tire_pressure_rr: null,
  tire_temp_rr: null,

  // Doors
  door_fl: false,
  door_fr: false,
  door_rl: false,
  door_rr: false,
  trunk_status: false,
  hood_status: false,

  // New Status
  handbrake_status: false,
  window_status: undefined,

  // Battery
  target_soc: null,
  remaining_charging_time: null,
  soh_percentage: null,
  battery_health_12v: null,
  battery_nominal_capacity_kwh: null,
  battery_type: "--",
  battery_serial: null,
  battery_manufacture_date: null,

  // Full Telemetry
  fullTelemetryData: {},
  fullTelemetryTimestamps: {},
  isScanning: false,

  // ECU & Versions
  bms_version: "--",
  gateway_version: "--",
  ecu_head_unit: "--",
  ignition_status: null,
  heading: 0,
  mhu_version: "--",
  vcu_version: "--",
  bcm_version: "--",

  central_lock_status: undefined,

  // Vehicle Status
  firmware_version: "--",
  tbox_version: "--",
  thermal_warning: 0,
  service_alert: 0,
  next_service_mileage: null,
  next_service_date: null,
  service_appointment_id: null,
  service_appointment_status: null,
};

const parseBatteryCapacityKwh = (vehicleInfo: any): number | null => {
  const rawBatteryCapacity =
    vehicleInfo?.batteryCapacity ??
    vehicleInfo?.battery_capacity ??
    vehicleInfo?.batteryCapacityKwh ??
    vehicleInfo?.batteryCapacityKWH;
  const batteryCapacity =
    rawBatteryCapacity !== null &&
    rawBatteryCapacity !== undefined &&
    rawBatteryCapacity !== ""
      ? Number(rawBatteryCapacity)
      : null;

  return Number.isFinite(batteryCapacity) ? batteryCapacity : null;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const TELEMETRY_STORAGE_PREFIX = "vf-telemetry-cache:";
const TELEMETRY_STORAGE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

// --- Persistent Telemetry Cache (survives page reload) ---

const TELEMETRY_PERSIST_FIELDS: Array<keyof VehicleState> = [
  "battery_level",
  "range",
  "speed",
  "odometer",
  "charging_status",
  "remaining_charging_time",
  "battery_health_12v",
  "soh_percentage",
  "tire_pressure_fl",
  "tire_pressure_fr",
  "tire_pressure_rl",
  "tire_pressure_rr",
  "tire_temp_fl",
  "tire_temp_fr",
  "tire_temp_rl",
  "tire_temp_rr",
  "latitude",
  "longitude",
  "outside_temp",
  "inside_temp",
  "gear_position",
  "is_locked",
  "door_fl",
  "door_fr",
  "door_rl",
  "door_rr",
  "trunk_status",
  "hood_status",
  "ignition_status",
  "heading",
  "battery_serial",
  "battery_manufacture_date",
  "battery_type",
  "battery_nominal_capacity_kwh",
  "target_soc",
  "central_lock_status",
  "handbrake_status",
  "location_address",
  "weather_address",
  "weather_outside_temp",
  "weather_code",
  "odoLastReceived",
];

const saveTelemetryToStorage = (vin: string, data: Partial<VehicleState>) => {
  if (typeof window === "undefined" || !vin) return;
  try {
    const payload: Record<string, any> = { _savedAt: Date.now() };
    for (const key of TELEMETRY_PERSIST_FIELDS) {
      const val = data[key];
      if (val !== undefined && val !== null && val !== "" && val !== "--") {
        payload[key] = val;
      }
    }
    // Only save if we have at least some real telemetry
    if (Object.keys(payload).length <= 1) return; // only _savedAt
    window.localStorage.setItem(
      TELEMETRY_STORAGE_PREFIX + vin,
      JSON.stringify(payload),
    );
  } catch {
    // quota exceeded or private browsing
  }
};

const loadTelemetryFromStorage = (
  vin: string,
): (Partial<VehicleState> & { _savedAt?: number }) | null => {
  if (typeof window === "undefined" || !vin) return null;
  try {
    const raw = window.localStorage.getItem(TELEMETRY_STORAGE_PREFIX + vin);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    const savedAt = parsed._savedAt;
    if (
      typeof savedAt !== "number" ||
      Date.now() - savedAt > TELEMETRY_STORAGE_TTL_MS
    ) {
      // Expired — remove
      window.localStorage.removeItem(TELEMETRY_STORAGE_PREFIX + vin);
      return null;
    }

    return parsed as Partial<VehicleState> & { _savedAt: number };
  } catch {
    return null;
  }
};

const TELEMETRY_SIGNALS: Array<keyof VehicleState> = [
  "battery_level",
  "range",
  "speed",
  "odometer",
  "remaining_charging_time",
  "battery_health_12v",
  "soh_percentage",
  "tire_pressure_fl",
  "tire_pressure_fr",
  "tire_pressure_rl",
  "tire_pressure_rr",
  "battery_capacity_kwh",
  "latitude",
  "longitude",
  "outside_temp",
  "inside_temp",
];

const hasTelemetryValues = (
  data: (Partial<VehicleState> & { _savedAt?: number }) | undefined | null,
  ttlMs: number = CACHE_TTL_MS,
) => {
  if (!data) return false;

  const lastUpdated = data.lastUpdated || (data as any)?._savedAt;
  if (typeof lastUpdated !== "number" || !Number.isFinite(lastUpdated)) return false;
  const now = Date.now();
  if (lastUpdated > now + 5 * 60 * 1000) return false;
  if (now - lastUpdated > ttlMs) return false;

  return TELEMETRY_SIGNALS.some((key) => {
    const value = data[key];
    if (value === null || value === undefined || value === "") return false;
    if (typeof value === "number" && Number.isNaN(value)) return false;
    if (typeof value === "number" && Number.isFinite(value)) return true;
    if (typeof value === "string" && value !== "--" && value.trim() !== "") return true;
    if (typeof value === "boolean") return true;
    return false;
  });
};

const getVehicleBaseState = (
  vehicleInfo: any,
  current: VehicleState,
): Partial<VehicleState> => {
  const batteryCapacity = parseBatteryCapacityKwh(vehicleInfo);

  return {
    vin: vehicleInfo.vinCode,
    marketingName: vehicleInfo.marketingName,
    vehicleVariant: vehicleInfo.vehicleVariant,
    color: vehicleInfo.exteriorColor || vehicleInfo.color,
    yearOfProduct: vehicleInfo.yearOfProduct,
    interiorColor: vehicleInfo.interiorColor,
    customizedVehicleName:
      vehicleInfo.customizedVehicleName || vehicleInfo.vehicleName,
    userVehicleType: vehicleInfo.userVehicleType,
    vehicleImage: vehicleInfo.vehicleImage, // from API
    vinfast_profile_image: vehicleInfo.profileImage, // Authoritative
    // Only update avatar if present
    user_avatar: vehicleInfo.profileImage || current.user_avatar,
    // Warranty
    warrantyExpirationDate: vehicleInfo.warrantyExpirationDate,
    warrantyMileage: vehicleInfo.warrantyMileage,
    battery_capacity_kwh: batteryCapacity,
  };
};

const refreshLocationWeatherForVin = (
  vin: string,
  telemetry: Partial<VehicleState> | null,
) => {
  if (!vin) return;
  if (!telemetry) return;

  const latitude = toCoordNumber(telemetry.latitude);
  const longitude = toCoordNumber(telemetry.longitude);
  if (!isValidCoordPair(latitude, longitude)) return;

  // Keep smart cache: helper decides TTL/distance/in-flight dedupe.
  void enrichLocationAndWeather(vin, latitude, longitude, false);
};

export const switchVehicle = async (targetVin: string) => {
  const current = vehicleStore.get();

  // 1. Find the vehicle in the list
  const vehicleInfo = current.vehicles.find((v) => v.vinCode === targetVin);
  if (!vehicleInfo) {
    console.error("Vehicle not found during switch", targetVin);
    return;
  }

  // Sync api.vin so wakeup/appPing headers target the correct vehicle
  api.vin = targetVin;

  // Tell server this is now the active vehicle (APK does this on every switch).
  // Must complete before MQTT reconnect so wakeup targets the correct T-Box.
  try {
    await api.setPrimaryVehicle(targetVin);
  } catch {
    // Non-fatal — continue with MQTT switch even if this fails
  }

  // 2. Prepare Base State from Vehicle Info
  const baseState = getVehicleBaseState(vehicleInfo, current);

  // 3. Hydrate from Cache if available (in-memory first, then localStorage)
  const cachedData = current.vehicleCache[targetVin] || {};
  const debugLogFromCache =
    current.debugLogByVin?.[targetVin] || cachedData.debugLog || [];

  // Try localStorage persistent cache for telemetry that survives page reloads
  const storedTelemetry = loadTelemetryFromStorage(targetVin);
  const mergedCache = storedTelemetry
    ? { ...storedTelemetry, ...cachedData } // in-memory cache wins over stored
    : cachedData;

  // Only skip refresh when cache still has fresh, real telemetry values
  const hasTelemetry =
    hasTelemetryValues(cachedData) ||
    hasTelemetryValues(storedTelemetry, TELEMETRY_STORAGE_TTL_MS);

  // Use stored timestamp as lastUpdated when no in-memory data exists
  const lastUpdated = cachedData.lastUpdated ||
    storedTelemetry?._savedAt ||
    Date.now();

  // Merge: Current State -> Reset Telemetry -> Base State -> Cached Data
  vehicleStore.set({
    ...current,
    ...INITIAL_TELEMETRY,
    ...baseState,
    ...mergedCache,
    vin: targetVin,
    lastUpdated,
    debugLog: debugLogFromCache,
    isRefreshing: !hasTelemetry, // Only show loading if we don't have telemetry
    dataSource: hasTelemetry ? "cache" : "none",
  });

  // Refresh external enrichment for this VIN only when coordinates changed or cache expired.
  refreshLocationWeatherForVin(targetVin, cachedData);

  // 4. Switch MQTT to new VIN — server now knows this is the active vehicle,
  //    so onConnected → wakeup/list_resource/app_ping will target correct T-Box.
  getMqttClient()
    .switchVin(targetVin)
    .catch((err) => console.warn("switchVehicle: MQTT switch failed", err));

  // Telemetry comes from MQTT — no REST fetch needed.
};

export const refreshVehicle = async (vin: string) => {
  if (!vin) return;

  // Trigger MQTT reconnect to get fresh data — no REST fetch needed.
  vehicleStore.setKey("isRefreshing" as any, true);
  try {
    const mqttClient = getMqttClient();
    await mqttClient.switchVin(vin);
  } catch (e) {
    console.warn("refreshVehicle: MQTT reconnect failed", e);
  } finally {
    vehicleStore.setKey("isRefreshing" as any, false);
  }
};

// REST fetchTelemetry and prefetchOtherVehicles removed — MQTT is the sole data source.

// Track retry count per VIN for exponential backoff
const deepScanRetryCount = new Map<string, { count: number; lastAttempt: number }>();

const DRAWER_MQTT_WAIT_MS = 5000; // Max wait for MQTT data when drawer is empty

/**
 * getDeepScanData — "Read Forever" approach
 *
 * Reads from the MQTT snapshot that is populated as messages arrive.
 * Reads from the MQTT snapshot populated as messages arrive.
 *
 * Flow:
 * 1. Check 5-min store cache → return early if fresh
 * 2. Read MQTT snapshot → if data exists, store & return (INSTANT)
 * 3. If empty: wait with exponential backoff for MQTT data to arrive
 */
export const getDeepScanData = async (vin: string, force = false) => {
  if (!vin) return;
  const current = vehicleStore.get();
  const now = Date.now();
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  // 1. Check store cache
  const lastFetch = current.fullTelemetryTimestamps[vin] || 0;
  const cachedData = current.fullTelemetryData[vin] || [];
  if (
    !force &&
    now - lastFetch < CACHE_DURATION &&
    Array.isArray(cachedData) &&
    cachedData.length > 0
  ) {
    console.log(`[Deep Scan] Using cached data for ${vin} (${cachedData.length} items)`);
    return;
  }

  vehicleStore.setKey("isScanning", true);

  try {
    // 2. Read MQTT snapshot (instant — no API calls)
    let snapshot = getRawMqttTelemetry(vin);

    if (snapshot.length > 0) {
      console.log(`[Deep Scan] MQTT snapshot instant: ${snapshot.length} items for ${vin}`);
      storeDeepScanSnapshot(vin, snapshot, now);
      deepScanRetryCount.delete(vin);
      return;
    }

    // 3. Snapshot is empty — wait with exponential backoff for MQTT data
    const retry = deepScanRetryCount.get(vin);
    const retryNum = retry && (now - retry.lastAttempt < 30000) ? retry.count : 0;
    const waitMs = Math.max(1000, DRAWER_MQTT_WAIT_MS >> retryNum); // halves each retry, min 1s
    const pollInterval = 500;
    const maxPolls = Math.ceil(waitMs / pollInterval);

    for (let i = 0; i < maxPolls; i++) {
      await sleepMs(pollInterval);
      snapshot = getRawMqttTelemetry(vin);
      if (snapshot.length > 0) break;
    }

    if (snapshot.length > 0) {
      console.log(`[Deep Scan] MQTT data arrived after wait: ${snapshot.length} items for ${vin}`);
      storeDeepScanSnapshot(vin, snapshot, now);
      deepScanRetryCount.delete(vin);
    } else {
      console.warn(`[Deep Scan] No MQTT data for ${vin} after ${waitMs}ms wait (retry #${retryNum})`);
      deepScanRetryCount.set(vin, { count: retryNum + 1, lastAttempt: now });
      // Store empty to avoid re-triggering immediately
      if (!current.fullTelemetryData[vin]?.length) {
        storeDeepScanSnapshot(vin, [], now);
      }
    }
  } catch (e) {
    console.error("[Deep Scan] Error:", e);
  } finally {
    vehicleStore.setKey("isScanning", false);
  }
};

/**
 * Store MQTT snapshot into vehicleStore for TelemetryDrawer to read.
 */
function storeDeepScanSnapshot(vin: string, rawData: any[], timestamp: number) {
  const current = vehicleStore.get();
  const newFullData = { ...current.fullTelemetryData, [vin]: rawData };
  const newTimestamps = { ...current.fullTelemetryTimestamps, [vin]: timestamp };

  vehicleStore.setKey("fullTelemetryData", newFullData);
  vehicleStore.setKey("fullTelemetryTimestamps", newTimestamps);
}

/**
 * fetchFullTelemetry — backward-compatible wrapper around getDeepScanData.
 * Existing callers (TelemetryDrawer) continue to work without changes.
 */
export const fetchFullTelemetry = async (vin: string, force = false) => {
  return getDeepScanData(vin, force);
};

export const fetchUser = async () => {
  try {
    const data = await api.getUserProfile();
    if (data) {
      vehicleStore.setKey("user_name", data.name || data.sub);

      // Only set avatar from Auth0 if we don't have a specific VinFast profile image
      const current = vehicleStore.get();
      if (!current.vinfast_profile_image) {
        vehicleStore.setKey("user_avatar", data.picture);
      }
    }
  } catch (e) {
    console.error("User Fetch Error", e);
  }
};

export const fetchVehicles = async (): Promise<string | null> => {
  try {
    const vehicles = await api.getVehicles();

    if (vehicles && vehicles.length > 0) {
      // Deduplicate vehicles based on vinCode
      const uniqueVehicles = Array.from(
        new Map(vehicles.map((v: any) => [v.vinCode, v])).values(),
      );
      const normalizedVehicles = uniqueVehicles.map((v: any) => ({
        ...v,
        batteryCapacity: parseBatteryCapacityKwh(v),
      }));

      // Store all vehicles
      vehicleStore.setKey("vehicles", normalizedVehicles);

      // Populate Cache with Initial Info for all vehicles
      const cache: Record<string, Partial<VehicleState>> = {};
      normalizedVehicles.forEach((v: any) => {
        cache[v.vinCode] = {
          vin: v.vinCode,
          marketingName: v.marketingName,
          vehicleVariant: v.vehicleVariant,
          color: v.exteriorColor || v.color,
          interiorColor: v.interiorColor,
          yearOfProduct: v.yearOfProduct,
          customizedVehicleName: v.customizedVehicleName || v.vehicleName,
          userVehicleType: v.userVehicleType,
          vehicleImage: v.vehicleImage,
          warrantyExpirationDate: v.warrantyExpirationDate,
          warrantyMileage: v.warrantyMileage,
          battery_capacity_kwh: v.batteryCapacity ?? null,
        };
      });
      vehicleStore.setKey("vehicleCache", cache);

      // Automatically switch to the first vehicle
      const firstVin = vehicles[0].vinCode;
      await switchVehicle(firstVin);

      return firstVin;
    }
    return null;
  } catch (e) {
    console.error("Fetch Vehicles Error", e);
    return null;
  }
};

// --- MQTT Live Updates ---

export const updateFromMqtt = (
  vin: string,
  parsedData: Partial<VehicleState>,
  rawMessages?: any[],
) => {
  ingestMqttTelemetry(vin, rawMessages || []);
  if (!vin || !parsedData || Object.keys(parsedData).length === 0) return;

  // Track "last updated" based on key telemetry fields — not every MQTT status message,
  // but meaningful data that users see on the dashboard.
  const KEY_FIELDS: (keyof VehicleState)[] = [
    "battery_level", "range", "odometer", "speed",
    "charging_status", "latitude", "longitude",
    "tire_pressure_fl", "tire_pressure_fr", "tire_pressure_rl", "tire_pressure_rr",
    "door_fl", "door_fr", "door_rl", "door_rr", "trunk_status", "hood_status",
    "central_lock_status", "ignition_status",
  ];
  const dataWithTimestamp = { ...parsedData, vin } as Partial<VehicleState>;
  const hasKeyData = KEY_FIELDS.some((f) => parsedData[f] !== undefined && parsedData[f] !== null);
  if (hasKeyData) {
    dataWithTimestamp.odoLastReceived = Date.now();
    dataWithTimestamp.dataSource = "live";
  }

  updateVehicleData(dataWithTimestamp);

  // Persist telemetry to localStorage for offline/reload cache
  const afterUpdate = vehicleStore.get();
  if (afterUpdate.vin === vin) {
    saveTelemetryToStorage(vin, afterUpdate);
  }

  // Clear loading state once first MQTT data arrives for the active vehicle.
  const current = afterUpdate;
  if (current.isRefreshing && current.vin === vin) {
    vehicleStore.setKey("isRefreshing" as any, false);
  }

  const latitude = toCoordNumber(parsedData.latitude);
  const longitude = toCoordNumber(parsedData.longitude);
  if (isValidCoordPair(latitude, longitude)) {
    void enrichLocationAndWeather(vin, latitude, longitude, false);
  }
};

export const getCachedMqttTelemetryCatalog = () => {
  loadMqttTelemetryCatalog();
  return Object.fromEntries(
    [...mqttTelemetryCatalog.entries()].map(([vin, entry]) => ({
      ...entry,
      vin,
    })),
  ) as Record<string, MqttTelemetryCatalogEntry>;
};

export const getMqttTelemetryCatalogForVin = (vin: string) => {
  if (!vin) return [];
  return getCachedTelemetryKeys(vin);
};

export const clearMqttTelemetryCatalogForVin = (vin?: string) => {
  clearCachedTelemetryCatalog(vin);
  if (vin) {
    mqttRawTelemetryByVin.delete(vin);
  } else {
    mqttRawTelemetryByVin.clear();
  }
};

export const getLiveMqttKeysForVin = (vin: string): string[] => {
  if (!vin) return [];
  return getCachedTelemetryKeys(vin);
};

export const getLiveMqttSnapshotForVin = (vin: string) => {
  if (!vin) return [];
  const snapshot = getRawMqttTelemetry(vin);
  return snapshot.map((item: any) => ({
    key: normalizeTelemetryKey(item),
    deviceKey: item?.deviceKey || item?.device_key || item?.path || "",
    value: item?.value ?? item?.Value,
    raw: item,
  }));
};

export const buildMqttTelemetryInspectorReport = (vin?: string) => {
  if (vin) {
    return {
      vin,
      catalogKeys: getLiveMqttKeysForVin(vin),
      snapshotKeys: getLiveMqttSnapshotForVin(vin).map((item) => item.key),
      snapshotCount: getRawMqttTelemetry(vin).length,
    };
  }

  const catalog = getCachedMqttTelemetryCatalog();
  const all: Record<
    string,
    { catalogKeys: string[]; snapshotKeys: string[]; snapshotCount: number }
  > = {};

  Object.keys(catalog).forEach((cachedVin) => {
    const snapshot = getLiveMqttSnapshotForVin(cachedVin);
    all[cachedVin] = {
      catalogKeys: catalog[cachedVin]?.keys || [],
      snapshotKeys: snapshot.map((item) => item.key),
      snapshotCount: snapshot.length,
    };
  });

  return all;
};

const isProductionMode =
  typeof process !== "undefined" && process.env?.NODE_ENV === "production";

if (!isProductionMode && typeof window !== "undefined") {
  (window as any).__vfMqttTelemetry = {
    getMqttTelemetryCatalog: getCachedMqttTelemetryCatalog,
    getMqttTelemetryCatalogForVin,
    getLiveMqttKeysForVin,
    getLiveMqttSnapshotForVin,
    buildMqttTelemetryInspectorReport,
    clearMqttTelemetryCatalogForVin,
  };
}
