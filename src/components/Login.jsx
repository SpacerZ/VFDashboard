import "../i18n";
import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../services/api";

export default function Login({ bgImage }) {
  const { t, i18n } = useTranslation(["login", "common"]);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [region, setRegion] = useState("vn"); // Default to Vietnam
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [regionDropdownOpen, setRegionDropdownOpen] = useState(false);
  const [langDropdownOpen, setLangDropdownOpen] = useState(false);

  const handleLangChange = (newLang) => {
    i18n.changeLanguage(newLang);
    setLangDropdownOpen(false);
  };

  useEffect(() => {
    // Auto-redirect if already authenticated (check metadata cookie)
    if (api.isLoggedIn) {
      window.location.href = "/";
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      await api.authenticate(email, password, region, rememberMe);

      // Successful login
      window.location.href = "/";
    } catch (err) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="flex h-full md:min-h-screen w-full flex-col items-center justify-center bg-cover bg-center relative px-4"
      style={{ backgroundImage: `url('${bgImage || "/vf9-interior.png"}')` }}
    >
      {/* Overlay for Blur and Darkening */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm"></div>

      {/* Main Content */}
      <div className="relative z-10 w-full max-w-md space-y-6">
        {/* Light Theme Login Card - Dashboard Style */}
        <div className="relative rounded-3xl bg-white p-8 pt-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 backdrop-blur-sm">
          {/* Error Toast - Absolute Position: Above Card */}
          {error && (
            <div className="absolute bottom-full left-0 w-full flex justify-center mb-5 animate-bounce-in">
              <div
                className="flex items-center w-full max-w-xs p-3 space-x-3 text-gray-500 bg-white rounded-2xl shadow-xl border border-red-100"
                role="alert"
              >
                <div className="inline-flex items-center justify-center flex-shrink-0 w-8 h-8 text-red-500 bg-red-50 rounded-xl">
                  <svg
                    className="w-5 h-5"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5Zm3.707 11.793a1 1 0 1 1-1.414 1.414L10 11.414l-2.293 2.293a1 1 0 0 1-1.414-1.414L8.586 10 6.293 7.707a1 1 0 0 1 1.414-1.414L10 8.586l2.293-2.293a1 1 0 0 1 1.414 1.414L11.414 10l2.293 2.293Z" />
                  </svg>
                  <span className="sr-only">Error icon</span>
                </div>
                <div
                  className="ms-3 text-sm font-bold text-gray-900 truncate"
                  title={error}
                >
                  {error}
                </div>
                <button
                  type="button"
                  onClick={() => setError("")}
                  className="ms-auto -mx-1.5 -my-1.5 bg-white text-gray-400 hover:text-gray-900 rounded-lg focus:ring-2 focus:ring-gray-300 p-1.5 hover:bg-gray-100 inline-flex items-center justify-center h-8 w-8"
                  aria-label="Close"
                >
                  <span className="sr-only">Close</span>
                  <svg
                    className="w-3 h-3"
                    aria-hidden="true"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 14 14"
                  >
                    <path
                      stroke="currentColor"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="m1 1 6 6m0 0 6 6M7 7l6-6M7 7l-6 6"
                    />
                  </svg>
                </button>
              </div>
            </div>
          )}
          {/* Language Toggle + VinFast Logo */}
          <div className="flex justify-end mb-2">
            <div className="relative">
              <button
                type="button"
                onClick={() => setLangDropdownOpen(!langDropdownOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-gray-700 bg-gray-100 border border-gray-200 hover:text-blue-600 hover:bg-blue-50 hover:border-blue-200 transition-colors shadow-sm"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                </svg>
                {i18n.language === "vi" ? "VI" : "EN"}
                <svg className={`w-2.5 h-2.5 text-gray-500 transition-transform duration-200 ${langDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {langDropdownOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setLangDropdownOpen(false)}></div>
                  <div className="absolute top-full right-0 mt-1 w-36 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 p-1 z-20 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                    {[
                      { val: "vi", label: "🇻🇳 Tiếng Việt" },
                      { val: "en", label: "🇺🇸 English" },
                    ].map((opt) => (
                      <button
                        key={opt.val}
                        type="button"
                        onClick={() => handleLangChange(opt.val)}
                        className={`w-full text-left px-3 py-1.5 rounded-lg text-sm font-bold transition-colors ${i18n.language === opt.val ? "bg-blue-50 text-blue-600" : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
          <div className="flex justify-center mb-4">
            {/* VinFast Logo */}
            <img
              src="/vinfast-logo.png"
              alt="VinFast"
              className="w-full h-auto max-h-24 object-contain px-2"
            />
          </div>

          <form className="mt-8 space-y-5" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <input
                  type="email"
                  required
                  className="relative block w-full rounded-xl border-gray-200 bg-gray-50 py-3.5 px-4 text-gray-900 focus:z-10 focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all duration-200 font-medium placeholder:text-gray-400 text-sm"
                  placeholder={t("login:emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div>
                <input
                  type="password"
                  required
                  className="relative block w-full rounded-xl border-gray-200 bg-gray-50 py-3.5 px-4 text-gray-900 focus:z-10 focus:ring-2 focus:ring-blue-600 focus:border-transparent transition-all duration-200 font-medium placeholder:text-gray-400 text-sm"
                  placeholder={t("login:passwordPlaceholder")}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="flex items-center pl-1">
                <div className="flex items-center h-5">
                  <input
                    id="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="w-4 h-4 border border-gray-300 rounded bg-gray-50 focus:ring-3 focus:ring-blue-300"
                  />
                </div>
                <label
                  htmlFor="remember-me"
                  className="ml-2 text-[10px] font-bold text-gray-500 uppercase tracking-wider"
                >
                  {t("login:rememberMe")}
                </label>
              </div>

              <div className="text-sm flex items-center bg-gray-50 px-3 py-1.5 rounded-lg">
                <label
                  htmlFor="region"
                  className="font-bold text-gray-500 text-xs uppercase tracking-wider mr-2"
                >
                  {t("login:region")}
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setRegionDropdownOpen(!regionDropdownOpen)}
                    className="flex items-center gap-1 bg-transparent text-gray-900 text-xs font-bold focus:outline-none"
                  >
                    {region === "vn"
                      ? t("login:regionVietnam")
                      : region === "us"
                        ? t("login:regionUS")
                        : t("login:regionEurope")}
                    <svg
                      className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${regionDropdownOpen ? "rotate-180" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>

                  {/* Custom Dropdown Menu */}
                  {regionDropdownOpen && (
                    <>
                      {/* Backdrop to close */}
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setRegionDropdownOpen(false)}
                      ></div>

                      {/* Menu */}
                      <div className="absolute top-full right-0 mt-2 w-40 bg-white rounded-xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-gray-100 p-1.5 z-20 animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                        {[
                          { val: "vn", label: t("login:regionVietnam") },
                          { val: "us", label: t("login:regionUS") },
                          { val: "eu", label: t("login:regionEurope") },
                        ].map((opt) => (
                          <button
                            key={opt.val}
                            type="button"
                            onClick={() => {
                              setRegion(opt.val);
                              setRegionDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                              region === opt.val
                                ? "bg-blue-50 text-blue-600"
                                : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading}
                className="group relative flex w-full justify-center rounded-xl bg-blue-600 py-3.5 px-4 text-sm font-black text-white uppercase tracking-wider hover:bg-blue-700 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-blue-200/50 shadow-md"
              >
                {loading ? (
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                ) : (
                  t("login:signIn")
                )}
              </button>
            </div>
          </form>
        </div>

        {/* About / Community */}
        <p className="relative text-center text-[11px] leading-relaxed text-white/70 px-2">
          {t("login:communityDescription")}
          {" "}{t("login:communityDiscussion")}{" "}
          <a
            href="https://www.facebook.com/groups/706124277686588/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-white hover:text-blue-300 underline underline-offset-2 transition-colors"
          >{t("login:communityGroup")}</a>.
        </p>

        {/* Trademark Disclaimer */}
        <p className="relative text-center text-[10px] leading-relaxed text-white/40 px-4">
          {t("login:disclaimer")}
        </p>

        {/* Footer: Github - Text - VF9 Club */}
        <div className="relative flex items-center justify-between px-6 py-4 bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {/* Left: GitHub */}
          <a
            href="https://github.com/VF9-Club/VFDashboard"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-400 hover:text-gray-900 transition-colors duration-300"
            title={t("login:viewSource")}
          >
            <svg
              className="h-8 w-8"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
                clipRule="evenodd"
              />
            </svg>
          </a>

          {/* Center: Text */}
          <p className="text-gray-500 text-xs font-bold uppercase tracking-wider text-center">
            {t("login:madeWith")} <span className="text-red-500 text-sm">❤️</span> {t("login:madeIn")}
          </p>

          {/* Right: VF9 Club */}
          <a
            href="https://www.facebook.com/groups/706124277686588/"
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src="/vf9-club-logo-new.png"
              alt="VF9 Club"
              className="h-8 object-contain opacity-100 hover:scale-110 transition-all duration-300"
            />
          </a>
        </div>
      </div>
    </div>
  );
}
