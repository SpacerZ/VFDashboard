import React from "react";
import { useTranslation } from "react-i18next";
import { useStore } from "@nanostores/react";
import {
  vehicleStore,
  switchVehicle,
  refreshVehicle,
} from "../stores/vehicleStore";
import { api } from "../services/api";
import { mqttStore } from "../stores/mqttStore";
import { currentLanguage, setLanguage } from "../stores/languageStore";
import AboutModal from "./AboutModal";

// Generate a local SVG avatar to avoid third-party avatar requests.
function localAvatar(name) {
  const initials = (name || "VF")
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"><rect width="40" height="40" rx="20" fill="%230D8ABC"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-size="16" font-weight="bold">${initials}</text></svg>`;
  return `data:image/svg+xml,${svg}`;
}

// Weather Icon (Dynamic WMO Codes)
const WeatherIcon = ({ temp, code }) => {
  // WMO Weather Codes:
  // 0: Clear sky
  // 1-3: Partly cloudy
  // 45,48: Fog
  // 51-67: Drizzle/Rain
  // 71-77: Snow
  // 80-82: Showers
  // 95-99: Thunderstorm

  let icon = (
    <svg
      className="w-5 h-5 text-blue-500"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
        d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
      ></path>
    </svg>
  ); // Default Sun

  if (code !== undefined && code !== null) {
    if (code >= 1 && code <= 3) {
      // Cloud
      icon = (
        <svg
          className="w-5 h-5 text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
          />
        </svg>
      );
    } else if (code >= 45 && code <= 48) {
      // Fog (Cloud + horizontal lines)
      icon = (
        <svg
          className="w-5 h-5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z M10 20h4 M8 18h8"
          />
        </svg>
      );
    } else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
      // Rain (Cloud + Drops)
      icon = (
        <svg
          className="w-5 h-5 text-blue-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M20 16.2A4.5 4.5 0 0017.5 8h-1.8A7 7 0 104 14.9 M16 22v-2 M12 22v-2 M8 22v-2"
          />
        </svg>
      );
    } else if (code >= 71 && code <= 77) {
      // Snow (Snowflake)
      icon = (
        <svg
          className="w-5 h-5 text-cyan-300"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M12 3v18M3 12h18M7.5 7.5l9 9M16.5 7.5l-9 9"
          />
        </svg>
      );
    } else if (code >= 95) {
      // Thunder
      icon = (
        <svg
          className="w-5 h-5 text-amber-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      );
    }
  }

  return (
    <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-full border border-blue-100">
      {icon}
      <span className="text-sm font-bold text-blue-700">
        {temp !== null && temp !== undefined ? `${temp}°C` : "N/A"}
      </span>
    </div>
  );
};

export default function VehicleHeader({ onOpenCharging, onOpenTelemetry }) {
  const vehicle = useStore(vehicleStore);
  const mqtt = useStore(mqttStore);
  const lang = useStore(currentLanguage);
  const { t, i18n } = useTranslation(["common", "dashboard", "vehicle"]);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [toolsOpen, setToolsOpen] = React.useState(false);
  const [showAbout, setShowAbout] = React.useState(false);
  const [langOpen, setLangOpen] = React.useState(false);

  const handleLangChange = (newLang) => {
    setLanguage(newLang);
    i18n.changeLanguage(newLang);
    setLangOpen(false);
  };

  const handleRefresh = () => {
    refreshVehicle(vehicle.vin);
  };

  const handleLogout = async () => {
    try {
      // Best effort server logout
      await fetch(`${import.meta.env.PUBLIC_API_URL || ""}/api/logout`, {
        method: "POST",
        credentials: "include",
      });
    } catch (e) {
      console.error("Logout failed", e);
    }

    // Critical: Clear local session before redirecting
    // This prevents Login page from auto-redirecting back to Dashboard
    if (api && typeof api.clearSession === "function") {
      api.clearSession();
    }

    window.location.href = "/login";
  };

  // Format Last Updated (Client-Side Only to avoid hydration mismatch)
  const [lastUpdatedTime, setLastUpdatedTime] = React.useState("--:--");

  React.useEffect(() => {
    if (vehicle.lastUpdated) {
      setLastUpdatedTime(
        new Date(vehicle.lastUpdated).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      );
    } else {
      setLastUpdatedTime("N/A");
    }
  }, [vehicle.lastUpdated]);

  return (
    <div className="relative z-50 flex items-center justify-between py-2 mb-2 gap-2 md:gap-4 pr-1">
      {/* Left: Branding & Model */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        <div className="h-10 w-10 md:h-12 md:w-12 rounded-full overflow-hidden shadow-md border border-gray-100/50 shrink-0">
          <img
            src="/logo.png"
            alt="VF9 Club"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-col min-w-0">
            {!vehicle.vin ? (
              <div className="h-6 w-48 bg-gray-100 animate-shimmer rounded"></div>
            ) : (
              <h1 className="text-base md:text-2xl font-extrabold text-gray-900 tracking-tight leading-none truncate animate-blur-in">
                {vehicle.manufacturer} {vehicle.marketingName}
              </h1>
            )}

            {!vehicle.vin ? (
              <div className="h-3 w-32 bg-gray-100 animate-shimmer rounded mt-2"></div>
            ) : (
              <div className="mt-1.5 flex items-center animate-blur-in">
                <span
                  className="text-[9px] md:text-xs text-gray-500 font-bold bg-gray-100 px-2 py-0.5 rounded text-transform uppercase shrink-0"
                  title={vehicle.vin}
                >
                  {vehicle.vin || "..."}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Right: Actions & Context */}
      <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
        <div className="hidden md:flex animate-blur-in">
          <WeatherIcon
            temp={vehicle.weather_outside_temp}
            code={vehicle.weather_code}
          />
        </div>

        {/* Last Updated & Refresh Group */}
        <button
          onClick={handleRefresh}
          disabled={vehicle.isRefreshing}
          title="Refresh Data"
          className="flex items-center gap-2 bg-white px-2 pr-3 h-9 rounded-full border border-gray-200 shadow-sm ml-1 hover:border-indigo-200 hover:text-indigo-600 transition-all-custom tap-active text-gray-500 cursor-pointer"
        >
          {/* Refresh Icon */}
          <div className="p-1.5 rounded-full">
            <svg
              className={`w-4 h-4 ${vehicle.isRefreshing ? "animate-spin text-indigo-600" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              ></path>
            </svg>
          </div>

          {/* Time Display (Right) */}
          <div className="hidden md:flex flex-col items-start leading-none">
            <span className="text-[8px] opacity-70 uppercase font-bold tracking-wider mb-0.5">
              Updated
            </span>
            <span className="text-xs font-mono font-bold tabular-nums leading-none">
              {lastUpdatedTime}
            </span>
          </div>

          {/* MQTT Status */}
          <div className="hidden md:flex flex-col items-start leading-none pl-2 pr-1 border-l border-gray-200">
            {mqtt.status === "connected" ? (
              <>
                <span className="text-[8px] text-green-600 uppercase font-bold tracking-wider mb-0.5">
                  Live
                </span>
                <span className="text-xs font-mono font-bold text-green-600 tabular-nums leading-none flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  MQTT
                </span>
              </>
            ) : mqtt.status === "connecting" ? (
              <>
                <span className="text-[8px] text-amber-500 uppercase font-bold tracking-wider mb-0.5">
                  Connecting
                </span>
                <span className="text-xs font-mono font-bold text-amber-500 tabular-nums leading-none">
                  MQTT...
                </span>
              </>
            ) : (
              <>
                <span className="text-[8px] text-red-400 uppercase font-bold tracking-wider mb-0.5">
                  Offline
                </span>
                <span className="text-xs font-mono font-bold text-red-400 tabular-nums leading-none">
                  Disconnected
                </span>
              </>
            )}
          </div>
        </button>

        {/* Tools Dropdown (Charging History) */}
        <div className="relative hidden md:block">
          <button
            onClick={() => setToolsOpen(!toolsOpen)}
            title={t("dashboard:tools")}
            className="flex items-center gap-2 px-3 h-9 bg-white text-gray-600 hover:text-indigo-600 hover:border-indigo-200 border border-gray-200 rounded-full transition-all-custom shadow-sm tap-active cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M4 6h16M4 12h16M4 18h16"
              />
            </svg>
            <span className="text-xs font-bold">{t("dashboard:tools")}</span>
            <svg
              className={`w-3 h-3 transition-transform ${toolsOpen ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {toolsOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setToolsOpen(false)}
              />
              <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right overflow-hidden">
                <button
                  onClick={() => {
                    setToolsOpen(false);
                    onOpenTelemetry();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-indigo-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center shrink-0">
                    <svg
                      className="w-4 h-4 text-indigo-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">{t("dashboard:deepScan")}</p>
                    <p className="text-[10px] text-gray-400">
                      {t("dashboard:deepScanDesc")}
                    </p>
                  </div>
                </button>

                <div className="h-px bg-gray-50 mx-3"></div>

                <button
                  onClick={() => {
                    setToolsOpen(false);
                    onOpenCharging();
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-green-50 transition-colors"
                >
                  <div className="w-8 h-8 rounded-xl bg-green-100 flex items-center justify-center shrink-0">
                    <svg
                      className="w-4 h-4 text-green-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">
                      {t("dashboard:chargingHistory")}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {t("dashboard:chargingHistoryDesc")}
                    </p>
                  </div>
                </button>
              </div>
            </>
          )}
        </div>

        <div className="h-6 w-px bg-gray-200 mx-1"></div>

        {/* User Profile / Logout */}
        <div className="flex items-center gap-3 pl-1">
          <div className="text-right hidden md:block">
            <p className="text-sm font-bold text-gray-900 leading-none">
              {vehicle.user_name}
            </p>
            <p className="text-xs text-gray-400 mt-0.5 font-medium tracking-wide">
              {vehicle.userVehicleType
                ? vehicle.userVehicleType
                    .replace("ROLE_", "")
                    .toLowerCase()
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())
                : ""}
            </p>
          </div>
          {/* Avatar Dropdown */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="group flex items-center justify-center h-10 w-10 cursor-pointer focus:outline-none"
              title="Menu"
            >
              <img
                src={
                  vehicle.user_avatar
                    ? vehicle.user_avatar
                    : localAvatar(vehicle.user_name)
                }
                alt="User"
                className="h-10 w-10 rounded-full border-2 border-white shadow-sm group-hover:ring-2 group-hover:ring-offset-2 group-hover:ring-blue-500 transition-all"
              />
            </button>

            {menuOpen && (
              <>
                {/* Backdrop to close */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setMenuOpen(false)}
                ></div>

                {/* Dropdown Menu */}
                <div className="absolute right-0 top-full mt-2 w-72 max-w-[calc(100vw-1.5rem)] bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 py-2 z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right overflow-x-hidden overflow-y-auto max-h-[calc(100dvh-4.5rem)]">
                  {/* User Section */}
                  <div className="px-4 py-3 border-b border-gray-50 bg-gray-50/30">
                    <p className="text-[10px] font-extrabold text-blue-600 uppercase tracking-widest mb-1">
                      Current User
                    </p>
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          vehicle.user_avatar || localAvatar(vehicle.user_name)
                        }
                        className="w-10 h-10 rounded-full border border-white shadow-sm"
                        alt=""
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-900 truncate">
                          {vehicle.user_name}
                        </p>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">
                          {vehicle.userVehicleType
                            ?.replace("ROLE_", "")
                            .replace(/_/g, " ")}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Vehicles Section */}
                  <div className="py-2">
                    <div className="px-4 py-1 mb-1">
                      <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-widest">
                        Your Vehicles
                      </p>
                    </div>

                    <div>
                      {(vehicle.vehicles || []).map((v) => {
                        const isSelected = v.vinCode === vehicle.vin;
                        const cached = vehicle.vehicleCache[v.vinCode] || {};
                        const name =
                          v.customizedVehicleName ||
                          v.marketingName ||
                          v.vehicleName ||
                          "VinFast Vehicle";

                        const img = v.vehicleImage || cached.vehicleImage;

                        return (
                          <button
                            key={v.vinCode}
                            onClick={() => {
                              if (!isSelected) switchVehicle(v.vinCode);
                              setMenuOpen(false);
                            }}
                            className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-all hover:bg-blue-50/50 group ${isSelected ? "bg-blue-50/80" : ""}`}
                          >
                            <div className="relative h-10 w-12 md:h-12 md:w-16 bg-gray-50 rounded-lg overflow-hidden border border-gray-100 p-1 flex items-center justify-center shrink-0">
                              <img
                                src={img || "/logo.png"}
                                className="w-full h-full object-contain drop-shadow-sm group-hover:scale-110 transition-transform"
                                alt={name}
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-sm font-extrabold truncate ${isSelected ? "text-blue-700" : "text-gray-900"}`}
                              >
                                {name}
                              </p>
                              <p className="text-[10px] font-mono font-bold text-gray-400 truncate tracking-tighter">
                                {v.vinCode}
                              </p>
                            </div>
                            {isSelected && (
                              <div className="h-5 w-5 rounded-full bg-blue-600 flex items-center justify-center shrink-0 shadow-sm border-2 border-white">
                                <svg
                                  className="w-3 h-3 text-white"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                  strokeWidth="4"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="h-px bg-gray-50 mx-2 my-1"></div>

                  <button
                    onClick={() => {
                      setShowAbout(true);
                      setMenuOpen(false);
                    }}
                    className="w-full text-left px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                  >
                    <svg
                      className="w-4 h-4 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    {t("common:aboutApp")}
                  </button>

                  {/* Language Selector */}
                  <div>
                    <button
                      onClick={() => setLangOpen(!langOpen)}
                      className="w-full text-left px-4 py-2.5 text-sm font-bold text-gray-600 hover:bg-gray-50 flex items-center gap-2 transition-colors"
                    >
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                      </svg>
                      {lang === "vi" ? "🇻🇳 Tiếng Việt" : "🇺🇸 English"}
                      <svg className={`w-3 h-3 ml-auto text-gray-400 transition-transform ${langOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {langOpen && (
                      <div className="mx-3 mb-1 rounded-xl border border-gray-100 bg-gray-50 p-1">
                        {[
                          { val: "vi", label: "🇻🇳 Tiếng Việt" },
                          { val: "en", label: "🇺🇸 English" },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() => handleLangChange(opt.val)}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold transition-colors ${lang === opt.val ? "bg-white text-blue-600 shadow-sm" : "text-gray-600 hover:bg-white"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2.5 text-sm font-bold text-red-500 hover:bg-red-50 flex items-center gap-2 transition-colors"
                  >
                    <svg
                      className="w-4 h-4 text-red-300"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                    {t("common:signOut")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <AboutModal isOpen={showAbout} onClose={() => setShowAbout(false)} />
    </div>
  );
}
