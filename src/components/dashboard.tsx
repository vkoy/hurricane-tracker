"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownUp,
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CircleHelp,
  Clock3,
  CloudLightning,
  Database,
  Download,
  ExternalLink,
  Globe2,
  Info,
  Layers,
  LoaderCircle,
  Moon,
  Pause,
  Play,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Target,
  TriangleAlert,
  Waves,
  Wind,
  X,
  Zap,
} from "lucide-react";
import {
  RISK_COLORS,
  type Assessment,
  type DashboardData,
  type LayerKey,
  type SourceStatus,
  type UtilityFeature,
} from "@/lib/types";
import { DEFAULT_WEIGHTS, FACTOR_LABELS } from "@/lib/scoring";
import { utilityAssessment } from "@/lib/selection";

const StormMap = dynamic(() => import("./storm-map"), {
  ssr: false,
  loading: () => (
    <div className="map-loading">
      <LoaderCircle className="spin" />
      <span>Loading interactive map…</span>
    </div>
  ),
});
type Modal = "sources" | "methodology" | "alerts" | null;
const initialLayers: Record<LayerKey, boolean> = {
  tracks: true,
  cones: true,
  wind: false,
  surge: false,
  utilities: true,
  impact: true,
  transmission: false,
  substations: false,
  outages: false,
  population: false,
  critical: false,
};
const fmt = (n: number | null | undefined) =>
  n == null ? "—" : n.toLocaleString("en-US");
const date = (s: string | null | undefined, full = false) =>
  s && !Number.isNaN(Date.parse(s))
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "UTC",
        ...(full ? { year: "numeric" } : {}),
      }).format(new Date(s)) + " UTC"
    : "Not available";
const stateLabel = (s: SourceStatus["state"]) =>
  ({
    live: "Connected",
    stale: "Stale data",
    partial: "Partial coverage",
    archived: "Archived",
    unavailable: "Unavailable",
    "not-configured": "Not connected",
  })[s];
function IconMark({ small = false }: { small?: boolean }) {
  return (
    <span className={`brand-mark ${small ? "small" : ""}`}>
      <span />
      <span />
      <span />
      <Zap size={small ? 15 : 22} strokeWidth={2.5} />
    </span>
  );
}
function StatusDot({ state }: { state: string }) {
  return <span className={`status-dot ${state}`} />;
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [layers, setLayers] = useState(initialLayers);
  const [stormId, setStormId] = useState("");
  const [stormSearch, setStormSearch] = useState("");
  const [utilitySearch, setUtilitySearch] = useState("");
  const [selectedUtility, setSelectedUtility] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [sort, setSort] = useState("score");
  const [visibleCount, setVisibleCount] = useState(30);
  const initialSelection = useRef(false);
  const [modal, setModal] = useState<Modal>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [layersOpen, setLayersOpen] = useState(true);
  const [drawer, setDrawer] = useState<"controls" | "intelligence" | null>(
    null,
  );
  const [light, setLight] = useState(false);
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [clock, setClock] = useState("—");
  const [toast, setToast] = useState("");
  const busy = useRef(false);
  const lastEtag = useRef<string | null>(null);
  const refresh = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setRefreshing(true);
    try {
      const response = await fetch("/api/dashboard", {
        cache: "no-store",
        signal: AbortSignal.timeout(60000),
        headers: lastEtag.current ? { "If-None-Match": lastEtag.current } : {},
      });
      if (response.status === 304) {
        setApiError(null);
        return;
      }
      if (!response.ok)
        throw new Error(
          "The dashboard service could not refresh. Check server configuration and try again.",
        );
      const value: DashboardData = await response.json();
      if (!Array.isArray(value.sources))
        throw new Error("The dashboard response could not be validated.");
      lastEtag.current = response.headers.get("etag");
      setData(value);
      setApiError(null);
      if (!initialSelection.current && value.storms.length) {
        const mostExposed = value.assessments
          .filter((a) => a.score !== null)
          .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
        if (mostExposed) setStormId(mostExposed.stormId);
        initialSelection.current = true;
      }
    } catch (e) {
      setApiError(e instanceof Error ? e.message : "Refresh failed.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      busy.current = false;
    }
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const update = () =>
      setClock(
        new Date().toLocaleTimeString("en-GB", {
          timeZone: "UTC",
          hour: "2-digit",
          minute: "2-digit",
        }) + " UTC",
      );
    update();
    const timer = setInterval(update, 10000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    try {
      setLight(localStorage.getItem("stormgrid-theme") === "light");
    } catch {}
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (modal) {
      const handler = (event: KeyboardEvent) => {
        if (event.key === "Escape") setModal(null);
      };
      document.addEventListener("keydown", handler);
      return () => document.removeEventListener("keydown", handler);
    }
  }, [modal]);
  const current = data?.sources.find((s) => s.id === "nhc-current");
  const utilitiesSource = data?.sources.find((s) => s.id === "utilities");
  const noStorms = current?.state === "live" && data?.storms.length === 0;
  const sourcesHealthy =
    !!data && data.sources.every((s) => s.state === "live") && !apiError;
  const selectedStorm = data?.storms.find((s) => s.id === stormId);
  const assessments = useMemo(
    () =>
      data?.assessments.filter((a) => !stormId || a.stormId === stormId) ?? [],
    [data, stormId],
  );
  const utilityRows = useMemo(
    () =>
      (data?.utilities.features ?? [])
        .map((utility) => ({
          utility,
          assessment: data
            ? utilityAssessment(data, utility.properties.id, stormId)
            : undefined,
        }))
        .filter(({ utility: u, assessment: a }) => {
          const p = u.properties;
          const query = utilitySearch.toLowerCase();
          return (
            (!query ||
              `${p.name} ${p.state} ${p.type} ${p.city ?? ""}`
                .toLowerCase()
                .includes(query)) &&
            (!stateFilter || p.state === stateFilter) &&
            (!riskFilter || a?.risk === riskFilter) &&
            (!typeFilter || p.type === typeFilter)
          );
        })
        .sort((a, b) => {
          const key =
            sort === "customers"
              ? "customersExposed"
              : sort === "outages"
                ? "reportedOutages"
                : sort === "assets"
                  ? "assetsExposed"
                  : "score";
          return (
            (b.assessment?.[key] ?? -1) - (a.assessment?.[key] ?? -1) ||
            a.utility.properties.name.localeCompare(b.utility.properties.name)
          );
        }),
    [
      data,
      assessments,
      utilitySearch,
      stateFilter,
      riskFilter,
      typeFilter,
      sort,
    ],
  );
  const selected = data?.utilities.features.find(
    (u) => u.properties.id === selectedUtility,
  );
  const selectedAssessment =
    data && selectedUtility
      ? utilityAssessment(data, selectedUtility, stormId)
      : undefined;
  const assessed = assessments.filter((a) => a.score !== null);
  const atRiskCount = new Set(
    assessed.filter((a) => a.score! >= 40).map((a) => a.utilityId),
  ).size;
  const timelineTimes = useMemo(
    () =>
      [
        ...new Set(
          (data?.geometry.points.features ?? [])
            .filter((p) => !stormId || p.properties.stormId === stormId)
            .flatMap((p) =>
              p.properties.validAt ? [p.properties.validAt] : [],
            ),
        ),
      ].sort(),
    [data, stormId],
  );
  const validAt =
    timelineTimes[
      Math.min(timelineIndex, Math.max(0, timelineTimes.length - 1))
    ] ?? null;
  useEffect(() => {
    setPlaying(false);
    const issued = selectedStorm?.issuedAt;
    const times = timelineTimes;
    const index = issued ? times.findIndex((t) => t >= issued) : 0;
    setTimelineIndex(Math.max(0, index));
  }, [stormId]);
  useEffect(() => {
    if (!playing || !timelineTimes.length) return;
    const timer = setInterval(
      () =>
        setTimelineIndex((i) => {
          if (i >= timelineTimes.length - 1) {
            setPlaying(false);
            return i;
          }
          return i + 1;
        }),
      1400,
    );
    return () => clearInterval(timer);
  }, [playing, timelineTimes]);
  const toggle = (key: LayerKey) =>
    setLayers((l) => ({ ...l, [key]: !l[key] }));
  const selectUtility = (id: string) => {
    setSelectedUtility(id);
    setLayers((l) => ({ ...l, utilities: true }));
    setDrawer("intelligence");
  };
  const exportData = () => {
    if (!data) return;
    const report = {
      application: "StormGrid Intelligence",
      exportedAt: new Date().toISOString(),
      notice:
        "Forecast hazard exposure is not an outage prediction. Missing values are null. Review source freshness and model completeness.",
      ...data,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `stormgrid-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setToast("Current data and source provenance exported.");
  };

  return (
    <div className={`app ${light ? "light" : ""}`}>
      <header className="topbar">
        <a className="brand" href="/" aria-label="StormGrid Intelligence home">
          <IconMark />
          <span>
            StormGrid<span className="brand-sub">INTELLIGENCE</span>
          </span>
        </a>
        <div className="brand-divider" />
        <nav className="main-nav" aria-label="Main navigation">
          <button className="active" onClick={() => setModal(null)}>
            <Globe2 size={15} />
            Live monitoring
          </button>
          <button onClick={() => setModal("sources")}>
            <Database size={15} />
            Data sources
          </button>
          <button onClick={() => setModal("methodology")}>
            <ShieldCheck size={15} />
            Methodology
          </button>
        </nav>
        <div className="header-right">
          <span className="utc-clock">
            <Clock3 size={13} />
            {clock}
          </span>
          <span className={`system-status ${sourcesHealthy ? "good" : ""}`}>
            <StatusDot state={sourcesHealthy ? "live" : "stale"} />
            {loading
              ? "CONNECTING"
              : sourcesHealthy
                ? "SYSTEM LIVE"
                : "LIMITED DATA"}
          </span>
          <span className="header-divider" />
          <button
            className="icon-button"
            aria-label={light ? "Use dark mode" : "Use light mode"}
            onClick={() =>
              setLight((v) => {
                try {
                  localStorage.setItem("stormgrid-theme", v ? "dark" : "light");
                } catch {}
                return !v;
              })
            }
          >
            {light ? <Moon size={18} /> : <Sun size={18} />}
          </button>
          <button
            className="icon-button notification-button"
            aria-label="Open alert center"
            onClick={() => setModal("alerts")}
          >
            <Bell size={18} />
            {data?.sources.some((s) => s.state !== "live") && <i />}
          </button>
          <span className="avatar" title="Operations workspace">
            OP
          </span>
        </div>
      </header>

      <div className="workspace-heading">
        <div>
          <div className="eyebrow">
            <span /> GRID SITUATIONAL AWARENESS
          </div>
          <h1>
            Storm intelligence
            <span className="workspace-tag">U.S. OPERATIONS</span>
          </h1>
        </div>
        <div className="heading-actions">
          <span className="refresh-caption">
            <span className={refreshing ? "pulse-dot" : "tiny-dot"} />
            {refreshing ? "Checking sources…" : "Auto-refresh · 60 sec"}
          </span>
          <button
            className="secondary-button refresh-button"
            onClick={refresh}
            disabled={refreshing}
          >
            <RefreshCw size={14} className={refreshing ? "spin" : ""} />
            <span>Refresh</span>
          </button>
          <button
            className="secondary-button"
            onClick={exportData}
            disabled={!data}
          >
            <Download size={14} />
            <span>Export report</span>
          </button>
        </div>
      </div>

      <section className="metric-grid" aria-label="Operational summary">
        <Metric
          icon={<CloudLightning size={19} />}
          title="ACTIVE TROPICAL SYSTEMS"
          value={
            loading
              ? "—"
              : current?.state === "live" || current?.state === "stale"
                ? fmt(data?.storms.length)
                : "—"
          }
          label={
            noStorms
              ? "No active systems reported"
              : current?.state === "live"
                ? "Official NHC observations"
                : "Official feed unavailable"
          }
          badge="NHC / NOAA"
          tone="blue"
        />
        <Metric
          icon={<Building2 size={18} />}
          title="UTILITIES AT HIGHER EXPOSURE"
          value={assessed.length ? fmt(atRiskCount) : "—"}
          label={
            assessed.length
              ? "High, very high or extreme exposure"
              : "Awaiting verified hazard & territory data"
          }
          badge="MODELED"
          tone="orange"
        />
        <Metric
          icon={<UsersIcon />}
          title="CUSTOMERS IN HAZARD AREA"
          value="—"
          label="Spatial customer data not connected"
          badge="ESTIMATED"
          tone="purple"
        />
        <Metric
          icon={<Zap size={18} />}
          title="REPORTED CUSTOMER OUTAGES"
          value="—"
          label="No verified outage feed connected"
          badge="OBSERVED"
          tone="teal"
        />
      </section>

      <div className="mobile-toolbar">
        <button
          onClick={() => setDrawer(drawer === "controls" ? null : "controls")}
        >
          <Layers size={15} /> Storms & layers
        </button>
        <button
          onClick={() =>
            setDrawer(drawer === "intelligence" ? null : "intelligence")
          }
        >
          <Activity size={15} /> Impact intelligence
        </button>
      </div>
      <main className="operations-layout">
        {drawer && (
          <button
            className="drawer-backdrop"
            aria-label="Close mobile panel"
            onClick={() => setDrawer(null)}
          />
        )}
        <aside
          className={`left-sidebar ${drawer === "controls" ? "drawer-open" : ""}`}
          aria-label="Storm and layer controls"
        >
          <div className="panel-title">
            <span>
              <Radio size={15} />
              Storm monitor
            </span>
            <button
              className="mobile-close icon-button"
              aria-label="Close storm controls"
              onClick={() => setDrawer(null)}
            >
              <X size={16} />
            </button>
            <span className="count-chip">{data?.storms.length ?? "—"}</span>
          </div>
          <div className="sidebar-body">
            <label className="search-input">
              <Search size={14} />
              <input
                placeholder="Search storms…"
                aria-label="Search storms"
                value={stormSearch}
                onChange={(e) => setStormSearch(e.target.value)}
              />
              <kbd>/</kbd>
            </label>
            <div className="section-label">
              ACTIVE SYSTEMS <span>ATLANTIC & EAST PACIFIC</span>
            </div>
            {loading ? (
              <div className="storm-empty">
                <LoaderCircle className="spin" size={22} />
                <strong>Checking official advisories</strong>
                <p>Connecting to the National Hurricane Center.</p>
              </div>
            ) : !data?.storms.length ? (
              <div className="storm-empty">
                <div
                  className={`radar-illustration ${noStorms ? "clear" : ""}`}
                >
                  <span />
                  <span />
                  <Radio size={22} />
                </div>
                <strong>
                  {noStorms
                    ? "Quiet skies. Staying ready."
                    : "Awaiting official storm data"}
                </strong>
                <p>
                  {noStorms
                    ? "No active tropical cyclones reported by the NHC. Monitoring continues."
                    : "The NHC feed is currently unreachable. Storm conditions are unknown."}
                </p>
                <button
                  className="text-button"
                  onClick={() => setModal("sources")}
                >
                  {noStorms ? "View source status" : "Check data connection"}
                  <ArrowRight size={12} />
                </button>
              </div>
            ) : (
              <div className="storm-list">
                <button
                  className={`all-storms ${!stormId ? "selected" : ""}`}
                  onClick={() => setStormId("")}
                >
                  <Globe2 size={14} />
                  All active systems<span>{data.storms.length}</span>
                </button>
                {data.storms
                  .filter((s) =>
                    s.name.toLowerCase().includes(stormSearch.toLowerCase()),
                  )
                  .map((s) => (
                    <button
                      key={s.id}
                      className={`storm-card ${stormId === s.id ? "selected" : ""}`}
                      onClick={() => setStormId(s.id)}
                      style={
                        { "--storm-color": s.color } as React.CSSProperties
                      }
                    >
                      <div>
                        <span className="storm-icon">◉</span>
                        <strong>
                          {s.name}
                          <small>
                            {s.classification}
                            {s.category && s.category > 0
                              ? ` · Cat ${s.category}`
                              : ""}{" "}
                            · Official advisory
                          </small>
                        </strong>
                        <ChevronRight size={14} />
                      </div>
                      <dl>
                        <div>
                          <dt>Wind</dt>
                          <dd>
                            {s.windKnots === null
                              ? "Unavailable"
                              : `${Math.round(s.windKnots * 1.15078)} mph`}
                          </dd>
                        </div>
                        <div>
                          <dt>Pressure</dt>
                          <dd>{s.pressureMb ?? "—"} mb</dd>
                        </div>
                        <div>
                          <dt>Movement</dt>
                          <dd>
                            {s.movement ?? "—"}
                            {s.movementSpeedKnots != null ? (
                              <small className="motion-speed">
                                {Math.round(s.movementSpeedKnots * 1.15078)} mph
                              </small>
                            ) : null}
                          </dd>
                        </div>
                      </dl>
                      <footer>{date(s.issuedAt)}</footer>
                    </button>
                  ))}
                {stormSearch &&
                  !data.storms.some((s) =>
                    s.name.toLowerCase().includes(stormSearch.toLowerCase()),
                  ) && (
                    <p className="muted small-text">
                      No storms match your search.
                    </p>
                  )}
              </div>
            )}
          </div>
          <div className="panel-divider" />
          <button
            className="section-toggle"
            aria-expanded={layersOpen}
            onClick={() => setLayersOpen((v) => !v)}
          >
            <span>
              <Layers size={15} />
              Map layers{" "}
              <small>
                {Object.values(layers).filter(Boolean).length} active
              </small>
            </span>
            {layersOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {layersOpen && (
            <div className="layers-body">
              <div className="layer-category">WEATHER INTELLIGENCE</div>
              <Layer
                label="Storm tracks"
                icon={<CloudLightning size={15} />}
                checked={layers.tracks}
                onChange={() => toggle("tracks")}
                color="blue"
              />
              <Layer
                label="Forecast cones"
                icon={<Target size={15} />}
                checked={layers.cones}
                onChange={() => toggle("cones")}
                color="blue"
              />
              <Layer
                label="Wind fields & radii"
                icon={<Wind size={15} />}
                checked={layers.wind}
                onChange={() => toggle("wind")}
                color="blue"
                badge={
                  !data?.geometry.wind.features.length ? "No data" : undefined
                }
              />
              <Layer
                label="Storm surge & flooding"
                icon={<Waves size={15} />}
                checked={false}
                disabled
                badge="Phase 2"
              />
              <div className="layer-category grid-label">ELECTRIC GRID</div>
              <Layer
                label="Electric utilities"
                icon={<Building2 size={15} />}
                checked={layers.utilities}
                onChange={() => toggle("utilities")}
                color="teal"
              />
              <Layer
                label="Utility hurricane impact"
                icon={<Activity size={15} />}
                checked={layers.impact}
                onChange={() => toggle("impact")}
                color="teal"
                emphasized
              />
              <Layer
                label="Transmission lines"
                icon={<Zap size={15} />}
                checked={false}
                disabled
                badge="Phase 2"
              />
              <Layer
                label="Substations & assets"
                icon={<Settings2 size={15} />}
                checked={false}
                disabled
                badge="Phase 2"
              />
              <Layer
                label="Power outage reports"
                icon={<Radio size={15} />}
                checked={false}
                disabled
                badge="Phase 2"
              />
              <Layer
                label="Population density"
                icon={<UsersIcon />}
                checked={false}
                disabled
                badge="Phase 2"
              />
              <Layer
                label="Critical infrastructure"
                icon={<ShieldCheck size={15} />}
                checked={false}
                disabled
                badge="Phase 2"
              />
              <button
                className="layer-source-note"
                onClick={() => setModal("sources")}
              >
                <Info size={12} />
                <span>
                  {utilitiesSource?.state === "live" ||
                  utilitiesSource?.state === "archived"
                    ? `${fmt(data?.utilities.features.length)} territories · ${utilitiesSource.state === "archived" ? "archived boundaries" : "connected"}`
                    : "Utility boundaries require a verified source"}
                </span>
                <ChevronRight size={12} />
              </button>
            </div>
          )}
          <div className="left-bottom">
            <ShieldCheck size={16} />
            <div>
              <strong>Official data. Transparent analysis.</strong>
              <span>Forecast exposure ≠ outage prediction</span>
            </div>
            <button
              aria-label="Read exposure methodology"
              onClick={() => setModal("methodology")}
            >
              <CircleHelp size={15} />
            </button>
          </div>
        </aside>

        <section className="map-panel" aria-label="Live operational map">
          <StormMap
            data={data}
            layers={layers}
            stormId={stormId}
            selectedUtility={selectedUtility}
            onUtility={selectUtility}
            onStorm={setStormId}
            validAt={validAt}
            light={light}
          />
          <div className="map-status-overlay">
            <span className={`map-source-status ${noStorms ? "clear" : ""}`}>
              <StatusDot state={current?.state || "unavailable"} />
              {loading
                ? "Connecting to official feeds"
                : noStorms
                  ? "No active tropical cyclones"
                  : current?.state === "live"
                    ? "Official NHC storm positions"
                    : current?.state === "stale"
                      ? "Stale official storm data"
                      : "Live storm feed unavailable"}
            </span>
            {(apiError || current?.state === "unavailable") && (
              <button
                onClick={() => setModal("sources")}
                aria-label="View storm feed issue"
              >
                <Info size={14} />
              </button>
            )}
          </div>
          <div className="map-legend">
            <div className="legend-heading">
              UTILITY EXPOSURE{" "}
              <button
                onClick={() => setModal("methodology")}
                aria-label="Explain utility exposure colors"
              >
                <Info size={12} />
              </button>
            </div>
            <div className="legend-scale">
              {Object.entries(RISK_COLORS).map(([name, color]) => (
                <div key={name}>
                  <span style={{ background: color }} />
                  <small>{name === "Very high" ? "V. high" : name}</small>
                </div>
              ))}
            </div>
            <div className="legend-na">
              <span />
              Not assessed <i>·</i> <span className="legend-dash" />
              Forecast track
            </div>
          </div>
          <div className="timeline">
            <div className="timeline-top">
              <div>
                <Clock3 size={14} />
                <strong>Track & forecast timeline</strong>
                <span>{selectedStorm?.name || "All systems"}</span>
              </div>
              <span className="forecast-tag">
                {validAt
                  ? selectedStorm?.issuedAt && validAt < selectedStorm.issuedAt
                    ? "OBSERVED TRACK"
                    : "OFFICIAL FORECAST"
                  : "AWAITING ADVISORY"}
              </span>
            </div>
            <div className="timeline-controls">
              <button
                className="play-button"
                aria-label={
                  playing ? "Pause forecast playback" : "Play forecast playback"
                }
                disabled={!data || timelineTimes.length < 2}
                onClick={() => {
                  if (timelineIndex >= timelineTimes.length - 1)
                    setTimelineIndex(0);
                  setPlaying((p) => !p);
                }}
              >
                {playing ? <Pause size={15} /> : <Play size={15} />}
              </button>
              <div className="timeline-track">
                <input
                  type="range"
                  aria-label="Forecast valid time"
                  min={0}
                  max={Math.max(1, timelineTimes.length - 1)}
                  value={timelineIndex}
                  onChange={(e) => {
                    setPlaying(false);
                    setTimelineIndex(Number(e.target.value));
                  }}
                  disabled={!timelineTimes.length}
                />
                <div className="timeline-labels">
                  {timelineTimes.length ? (
                    <>
                      <span>{date(timelineTimes[0])}</span>
                      <span>{date(timelineTimes.at(-1))}</span>
                    </>
                  ) : (
                    <>
                      <span>Observed</span>
                      <span>+24 h</span>
                      <span>+48 h</span>
                      <span>+72 h</span>
                      <span>+120 h</span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="timeline-foot">
              <span>
                {validAt
                  ? `Valid ${date(validAt)}`
                  : "No official forecast positions available"}
              </span>
              <span>
                {validAt
                  ? "Scores use the full advisory footprint"
                  : "Forecast availability varies by advisory"}
              </span>
            </div>
          </div>
        </section>

        <aside
          className={`right-sidebar ${drawer === "intelligence" ? "drawer-open" : ""}`}
          aria-label="Impact intelligence"
        >
          <div className="panel-title">
            <span>
              <Activity size={16} />
              Impact intelligence
            </span>
            <button
              className="mobile-close icon-button"
              aria-label="Close impact intelligence"
              onClick={() => setDrawer(null)}
            >
              <X size={16} />
            </button>
            <span className="intelligence-badge">EXPOSURE MODEL</span>
          </div>
          {selected ? (
            <UtilityDetails
              utility={selected}
              assessment={selectedAssessment}
              data={data!}
              onClose={() => setSelectedUtility(null)}
              onMethodology={() => setModal("methodology")}
            />
          ) : (
            <>
              <div className="ranking-header">
                <div className="ranking-title">
                  <span className="section-icon">
                    <Building2 size={17} />
                  </span>
                  <div>
                    <h2>
                      Most at-risk
                      <br />
                      electric utilities
                    </h2>
                    <p>Ranked by forecast hazard exposure</p>
                  </div>
                </div>
                <div className="ranking-coverage-note">
                  <Info size={11} />
                  <span>
                    {utilitiesSource?.state === "archived"
                      ? "Archived boundaries · source dates 2015–2023"
                      : "Rankings use only available hazard inputs"}
                  </span>
                </div>
                <div className="ranking-tabs">
                  <button
                    className="active"
                    onClick={() => setFiltersOpen(false)}
                  >
                    Utility rankings{" "}
                    <span>
                      {assessed.length
                        ? new Set(assessed.map((a) => a.utilityId)).size
                        : "—"}
                    </span>
                  </button>
                  <button onClick={() => setModal("alerts")}>
                    Alerts{" "}
                    <span>
                      {data?.sources.filter((s) => s.state !== "live").length ??
                        0}
                    </span>
                  </button>
                </div>
                <div className="ranking-search">
                  <label className="search-input">
                    <Search size={13} />
                    <input
                      aria-label="Search utility or state"
                      placeholder="Search utility, state or city…"
                      value={utilitySearch}
                      onChange={(e) => setUtilitySearch(e.target.value)}
                    />
                  </label>
                  <button
                    className={`filter-button ${filtersOpen ? "active" : ""}`}
                    onClick={() => setFiltersOpen((v) => !v)}
                    aria-label="Filter utilities"
                    aria-expanded={filtersOpen}
                  >
                    <SlidersHorizontal size={15} />
                  </button>
                </div>
                {filtersOpen && (
                  <div className="filters-panel">
                    <label>
                      State
                      <select
                        value={stateFilter}
                        onChange={(e) => setStateFilter(e.target.value)}
                      >
                        <option value="">All states</option>
                        {[
                          ...new Set(
                            data?.utilities.features.map(
                              (u) => u.properties.state,
                            ) ?? [],
                          ),
                        ]
                          .sort()
                          .map((s) => (
                            <option key={s}>{s}</option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Risk level
                      <select
                        value={riskFilter}
                        onChange={(e) => setRiskFilter(e.target.value)}
                      >
                        <option value="">All risk levels</option>
                        {Object.keys(RISK_COLORS).map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Utility type
                      <select
                        value={typeFilter}
                        onChange={(e) => setTypeFilter(e.target.value)}
                      >
                        <option value="">All utility types</option>
                        {[
                          ...new Set(
                            data?.utilities.features.map(
                              (u) => u.properties.type,
                            ) ?? [],
                          ),
                        ].map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="text-button"
                      onClick={() => {
                        setStateFilter("");
                        setRiskFilter("");
                        setTypeFilter("");
                        setUtilitySearch("");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
                <div className="sort-row">
                  <span>
                    {utilityRows.length} utilities{" "}
                    {data?.utilities.features.length ? "in view" : "assessed"}
                  </span>
                  <label>
                    <ArrowDownUp size={11} />
                    <select
                      aria-label="Sort utility rankings"
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="score">Exposure score</option>
                      <option value="customers">Customers exposed</option>
                      <option value="outages">Reported outages</option>
                      <option value="assets">Assets exposed</option>
                    </select>
                  </label>
                </div>
              </div>
              <div className="ranking-content">
                {loading ? (
                  <div className="ranking-empty">
                    <LoaderCircle size={25} className="spin" />
                    <h3>Assessing data availability</h3>
                    <p>
                      Checking official storms and connected territory sources.
                    </p>
                  </div>
                ) : utilityRows.length ? (
                  <div className="utility-list">
                    {utilityRows
                      .slice(0, visibleCount)
                      .map(({ utility: u, assessment: a }, i) => (
                        <button
                          key={u.properties.id}
                          className={`utility-card ${selectedUtility === u.properties.id ? "selected" : ""}`}
                          onClick={() => selectUtility(u.properties.id)}
                        >
                          <div className="utility-card-top">
                            <span className="rank-index">
                              {i + 1 < 10 ? `0${i + 1}` : i + 1}
                            </span>
                            <div>
                              <strong>{u.properties.name}</strong>
                              <span>
                                {u.properties.state} · {u.properties.type}
                              </span>
                            </div>
                            <b
                              style={{
                                color: a?.risk
                                  ? RISK_COLORS[a.risk]
                                  : "var(--muted)",
                              }}
                            >
                              {a?.score ?? "—"}
                              <small>/100</small>
                            </b>
                          </div>
                          <div className="score-bar">
                            <i
                              style={{
                                width: `${a?.score ?? 0}%`,
                                background: a?.risk
                                  ? RISK_COLORS[a.risk]
                                  : "transparent",
                              }}
                            />
                          </div>
                          <div className="utility-card-bottom">
                            <span
                              title={
                                a
                                  ? data?.storms.find((s) => s.id === a.stormId)
                                      ?.name
                                  : undefined
                              }
                              style={{
                                color: a?.risk
                                  ? RISK_COLORS[a.risk]
                                  : undefined,
                              }}
                            >
                              {a?.risk ?? "Not assessed"}
                            </span>
                            <span>
                              {a
                                ? `${a.completeness}% input coverage`
                                : "Hazards unavailable"}
                              <ChevronRight size={12} />
                            </span>
                          </div>
                        </button>
                      ))}
                    {utilityRows.length > visibleCount && (
                      <button
                        className="text-button load-more"
                        onClick={() => setVisibleCount((c) => c + 30)}
                      >
                        Show 30 more utilities <ChevronDown size={13} />
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="ranking-empty">
                    <div className="empty-grid-icon">
                      <Building2 size={28} />
                      <span>
                        <Search size={13} />
                      </span>
                    </div>
                    <span className="empty-eyebrow">
                      NO VERIFIED EXPOSURE RESULTS
                    </span>
                    <h3>
                      {data?.utilities.features.length
                        ? "No utilities match these filters"
                        : "Intelligence starts with reliable data."}
                    </h3>
                    <p>
                      {data?.utilities.features.length
                        ? "Try a different state, utility name, or risk classification."
                        : "Connect verified utility boundaries and official forecast hazards to see a defensible exposure ranking."}
                    </p>
                    <button
                      className="primary-button"
                      onClick={() =>
                        data?.utilities.features.length
                          ? (setStateFilter(""),
                            setRiskFilter(""),
                            setTypeFilter(""),
                            setUtilitySearch(""))
                          : setModal("sources")
                      }
                    >
                      {data?.utilities.features.length
                        ? "Reset filters"
                        : "View data connections"}
                      <ArrowRight size={14} />
                    </button>
                    <div className="empty-checklist">
                      <span>
                        <CheckCircle2 size={13} />
                        Geographic analysis engine ready
                      </span>
                      <span>
                        <CheckCircle2 size={13} />
                        Transparent, weighted risk model
                      </span>
                      <span>
                        <Clock3 size={13} />
                        Waiting for verified provider inputs
                      </span>
                    </div>
                  </div>
                )}
              </div>
              <div className="assessment-note">
                <Info size={14} />
                <p>
                  <strong>Exposure, not an outage prediction.</strong>Scores
                  reflect forecast hazards and available data. Missing inputs
                  are never treated as zero risk.
                  <button onClick={() => setModal("methodology")}>
                    Explore the methodology <ArrowRight size={11} />
                  </button>
                </p>
              </div>
              <div className="data-health">
                <div>
                  <span>
                    <Database size={13} />
                    DATA HEALTH
                  </span>
                  <button onClick={() => setModal("sources")}>
                    View all
                    <ChevronRight size={12} />
                  </button>
                </div>
                {data?.sources.map((s) => (
                  <button
                    key={s.id}
                    className="health-row"
                    onClick={() => setModal("sources")}
                  >
                    <span>
                      <StatusDot state={s.state} />
                      {s.id === "nhc-current"
                        ? "NHC storm advisories"
                        : s.id === "nhc-gis"
                          ? "Forecast geometry"
                          : "Utility territories"}
                    </span>
                    <small className={s.state}>{stateLabel(s.state)}</small>
                  </button>
                )) ?? (
                  <p className="muted small-text">
                    Connecting to data providers…
                  </p>
                )}
              </div>
            </>
          )}
        </aside>
      </main>
      <footer className="app-footer">
        <span>
          <IconMark small />
          STORMGRID INTELLIGENCE<span className="footer-separator">/</span>Built
          for the moments that matter.
        </span>
        <span>
          <StatusDot state={sourcesHealthy ? "live" : "stale"} />
          {data
            ? `Last checked ${date(data.fetchedAt)}`
            : "Initializing data sources"}
          <span className="footer-separator">|</span>
          <button onClick={() => setModal("sources")}>
            Sources & attribution <ExternalLink size={10} />
          </button>
        </span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
      {apiError && (
        <div className="api-error" role="alert">
          <TriangleAlert size={15} />
          {apiError}
          {data && " Displaying the last received snapshot."}
          <button onClick={refresh}>Retry</button>
        </div>
      )}
      {modal && (
        <ModalWindow
          title={
            modal === "sources"
              ? "Data connections"
              : modal === "methodology"
                ? "Exposure methodology"
                : "Alert center"
          }
          subtitle={
            modal === "sources"
              ? "Source transparency is part of the forecast."
              : modal === "methodology"
                ? "Every score should be explainable."
                : "Operational awareness, without the noise."
          }
          onClose={() => setModal(null)}
        >
          {modal === "sources" ? (
            <SourcesPanel
              data={data}
              refreshing={refreshing}
              refresh={refresh}
            />
          ) : modal === "methodology" ? (
            <MethodologyPanel data={data} />
          ) : (
            <AlertsPanel data={data} onSources={() => setModal("sources")} />
          )}
        </ModalWindow>
      )}
    </div>
  );
}

function UsersIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  );
}
function Metric({
  icon,
  title,
  value,
  label,
  badge,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  label: string;
  badge: string;
  tone: string;
}) {
  return (
    <div className={`metric ${tone}`}>
      <div className="metric-top">
        <span className="metric-label">{title}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        <span>{badge}</span>
      </div>
      <div className="metric-caption">
        <span />
        {label}
      </div>
    </div>
  );
}
function Layer({
  label,
  icon,
  checked,
  onChange,
  disabled,
  badge,
  color,
  emphasized,
}: {
  label: string;
  icon: React.ReactNode;
  checked: boolean;
  onChange?: () => void;
  disabled?: boolean;
  badge?: string;
  color?: string;
  emphasized?: boolean;
}) {
  return (
    <div
      className={`layer-row ${disabled ? "disabled" : ""} ${emphasized ? "emphasized" : ""} ${color ?? ""}`}
    >
      <span className="layer-icon">{icon}</span>
      <span className="layer-name">
        {label}
        {badge && <small>{badge}</small>}
      </span>
      <button
        role="switch"
        aria-label={label}
        aria-checked={checked}
        disabled={disabled}
        onClick={onChange}
        className={`switch ${checked ? "on" : ""}`}
        title={
          disabled
            ? "Requires a verified Phase 2 integration"
            : `Toggle ${label}`
        }
      >
        <span />
      </button>
    </div>
  );
}

function UtilityDetails({
  utility,
  assessment: a,
  data,
  onClose,
  onMethodology,
}: {
  utility: UtilityFeature;
  assessment?: Assessment;
  data: DashboardData;
  onClose: () => void;
  onMethodology: () => void;
}) {
  const p = utility.properties;
  const storm = data.storms.find((s) => s.id === a?.stormId);
  return (
    <div className="utility-details">
      <button className="back-button" onClick={onClose}>
        <ChevronLeft size={14} />
        Back to utility rankings
      </button>
      <div className="detail-company">
        <span className="section-icon">
          <Building2 size={24} />
        </span>
        <h2>{p.name}</h2>
        <p>
          {p.state} · {p.type}
        </p>
      </div>
      <div className="detail-score">
        <div>
          <span>EXPOSURE SCORE</span>
          <strong style={{ color: a?.risk ? RISK_COLORS[a.risk] : undefined }}>
            {a?.score ?? "—"}
            <small>/ 100</small>
          </strong>
        </div>
        <div>
          <span style={{ color: a?.risk ? RISK_COLORS[a.risk] : undefined }}>
            {a?.risk ?? "Not assessed"}
          </span>
          <small>
            {a
              ? `${a.completeness}% data completeness`
              : "Hazard data unavailable"}
          </small>
          <small>{a?.confidence ?? "Unknown"} confidence</small>
        </div>
      </div>
      <DetailSection title="Company overview">
        <DetailRow label="Entity state (source)" value={p.state} />
        <DetailRow label="Utility type" value={p.type} />
        <DetailRow label="Total customers" value={fmt(p.customers)} />
        <DetailRow
          label="Customer data year"
          value={p.customerYear ?? "Unavailable"}
        />
        <DetailRow
          label="Entity location (source)"
          value={p.city ?? "Unavailable"}
        />
        <DetailRow
          label="Boundary source date"
          value={p.sourceDate ? date(p.sourceDate) : "Unavailable"}
        />
        {p.website && (
          <a href={p.website} target="_blank" rel="noreferrer">
            Official utility website
            <ExternalLink size={12} />
          </a>
        )}
        <a href={p.sourceUrl} target="_blank" rel="noreferrer">
          Territory source
          <ExternalLink size={12} />
        </a>
      </DetailSection>
      <DetailSection title="Active hurricane exposure">
        <DetailRow label="Storm" value={storm?.name ?? "Not assessed"} />
        <DetailRow
          label="Territory in wind footprint"
          value={
            a?.territoryPercent == null
              ? "Unavailable"
              : `${Math.round(a.territoryPercent)}%`
          }
        />
        <DetailRow
          label="Wind-radius threshold"
          value={a?.windKnots == null ? "Unavailable" : `${a.windKnots} kt`}
        />
        <DetailRow label="Customers exposed" value="Unavailable" />
        <DetailRow
          label="Territory in forecast cone"
          value={
            a?.conePercent == null
              ? "Unavailable"
              : `${Math.round(a.conePercent)}%`
          }
        />
        <DetailRow label="Advisory issued" value={date(storm?.issuedAt)} />
        <p className="detail-note">
          The cone describes uncertainty in the storm center. It is not a wind
          or flood footprint.
        </p>
      </DetailSection>
      <DetailSection title="Infrastructure & outage intelligence">
        <DetailRow label="Exposed substations" value="Not connected" />
        <DetailRow label="Transmission / generation" value="Not connected" />
        <DetailRow label="Reported customer outages" value="Not connected" />
        <DetailRow label="Verified restoration estimate" value="Unavailable" />
      </DetailSection>
      <DetailSection title="Why this score?">
        <p className="explanation">
          {a?.explanation ??
            "A score requires verified utility boundaries and official forecast wind footprints. No estimate has been substituted."}
        </p>
        {a?.factors.map((f) => (
          <div className="factor-row" key={f.key}>
            <span>{f.label}</span>
            <b>{f.value === null ? "N/A" : Math.round(f.value)}</b>
            <small>{f.weight}% weight</small>
          </div>
        ))}
        <button className="text-button" onClick={onMethodology}>
          Full methodology
          <ArrowRight size={12} />
        </button>
        <p className="detail-note">Computed: {date(a?.computedAt)}</p>
      </DetailSection>
    </div>
  );
}
function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="detail-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}
function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function ModalWindow({
  title,
  subtitle,
  children,
  onClose,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => previous?.focus();
  }, []);
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
        tabIndex={-1}
        onKeyDown={(e) => {
          if (e.key !== "Tab") return;
          const nodes = ref.current?.querySelectorAll<HTMLElement>(
            'button:not([disabled]),a[href],input,select,[tabindex="0"]',
          );
          if (!nodes?.length) return;
          const first = nodes[0],
            last = nodes[nodes.length - 1];
          if (
            e.shiftKey &&
            (document.activeElement === first ||
              document.activeElement === ref.current)
          ) {
            e.preventDefault();
            last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
          }
        }}
      >
        <div className="modal-header">
          <div>
            <span className="eyebrow">STORMGRID INTELLIGENCE</span>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
function SourcesPanel({
  data,
  refreshing,
  refresh,
}: {
  data: DashboardData | null;
  refreshing: boolean;
  refresh: () => void;
}) {
  return (
    <>
      <div className="source-intro">
        <ShieldCheck size={18} />
        <p>
          Only retrieved, validated provider data is displayed. A missing feed
          means <strong>unknown conditions</strong>, not an absence of storms or
          risk.
        </p>
      </div>
      {data?.sources.map((s) => (
        <article className="source-card" key={s.id}>
          <div>
            <h3>
              <Database size={16} />
              {s.name}
            </h3>
            <span className={`source-state ${s.state}`}>
              <StatusDot state={s.state} />
              {stateLabel(s.state)}
            </span>
          </div>
          <p>{s.message}</p>
          <dl>
            <div>
              <dt>Last successful retrieval</dt>
              <dd>{date(s.fetchedAt, true)}</dd>
            </div>
            <div>
              <dt>Source issue / vintage</dt>
              <dd>{date(s.issuedAt, true)}</dd>
            </div>
            <div>
              <dt>Minimum refresh interval</dt>
              <dd>
                {s.refreshMinutes < 60
                  ? `${s.refreshMinutes} minutes`
                  : `${s.refreshMinutes / 60} hours`}
              </dd>
            </div>
            <div>
              <dt>Attribution</dt>
              <dd>{s.attribution}</dd>
            </div>
          </dl>
          <p className="license-note">{s.license}</p>
          <a href={s.url} target="_blank" rel="noreferrer">
            View original source
            <ExternalLink size={12} />
          </a>
        </article>
      ))}
      {!data && (
        <p>Provider status has not loaded. Retry the connection below.</p>
      )}
      <div className="connection-notice">
        <Info size={17} />
        <div>
          <h4>Connecting utility territories</h4>
          <p>
            The default layer is a public HIFLD archive attributed to ORNL / DOE
            CESER, with per-record source dates and explicit exclusions for
            invalid geometries. Current boundaries can replace this archive
            through reviewed GeoJSON and ArcGIS polygon services. An
            administrator must supply the provider URL, field mapping,
            attribution, source date, and permitted reuse terms. The archived
            data is public domain; its age and geometric approximations limit
            operational precision.
          </p>
          <p>
            See the project’s <code>README.md</code> and{" "}
            <code>.env.example</code> for connection instructions. NOAA and the
            selected provider must be allowed by the hosting environment’s
            network policy.
          </p>
        </div>
      </div>
      <p className="fine-print">
        Public services provide no guaranteed availability or quota. Requests
        are cached, bounded and rate-limited by the application; provider terms
        must be rechecked before production deployment. Basemap: Natural Earth
        (public domain) and U.S. Census-derived us-atlas boundaries. No external
        basemap token required.
      </p>
      <button
        className="primary-button"
        onClick={refresh}
        disabled={refreshing}
      >
        <RefreshCw size={14} className={refreshing ? "spin" : ""} />
        {refreshing ? "Checking sources…" : "Recheck connections"}
      </button>
    </>
  );
}
function MethodologyPanel({ data }: { data: DashboardData | null }) {
  const weights = data?.weights ?? DEFAULT_WEIGHTS;
  return (
    <>
      <div className="methodology-callout">
        <Target size={25} />
        <div>
          <h3>A measure of hazard exposure.</h3>
          <p>
            Not a probability of failure. Not a prediction of customer outages.
          </p>
        </div>
      </div>
      <p className="modal-prose">
        StormGrid intersects verified electric utility service territories with
        official forecast wind footprints. It combines available factors into a
        0–100 exposure score. The initial weights are configurable assumptions,
        not validated outage-prediction coefficients.
      </p>
      <div className="weight-list">
        {Object.entries(weights).map(([key, weight]) => (
          <div key={key}>
            <span>{FACTOR_LABELS[key as keyof typeof weights]}</span>
            <div>
              <i style={{ width: `${weight * 3}%` }} />
            </div>
            <b>{weight}%</b>
          </div>
        ))}
      </div>
      <div className="formula">
        Score = Σ (available factor × weight) / Σ available weights
      </div>
      <h3 className="modal-section-title">How inputs are measured</h3>
      <ol className="method-steps">
        <li>
          <strong>Wind exposure</strong>
          <p>
            Maximum intersecting official forecast wind-radius threshold in
            knots, capped at 100. This is not the predicted wind speed at every
            location.
          </p>
        </li>
        <li>
          <strong>Territory exposure</strong>
          <p>
            Percent of geodesic service-territory area inside the union of ≥34
            kt forecast wind polygons. Overlapping polygons and forecast periods
            count once.
          </p>
        </li>
        <li>
          <strong>Scenario sensitivity</strong>
          <p>
            Percent of territory within the official uncertainty cone. The cone
            describes the storm center’s possible track; it is not a hazard
            footprint. Cone overlap alone never produces a risk score.
          </p>
        </li>
        <li>
          <strong>Missing means missing</strong>
          <p>
            Customer, asset and flood factors remain unavailable until verified
            spatial inputs are connected. Missing factors are excluded;
            remaining weights are renormalized. Completeness is the share of
            total model weight with available inputs.
          </p>
        </li>
      </ol>
      <div className="risk-thresholds">
        {Object.entries(RISK_COLORS).map(([name, color], i) => (
          <div key={name}>
            <span style={{ background: color }} />
            <strong>{name}</strong>
            <small>
              {i * 20}–{i === 4 ? 100 : i * 20 + 19}
            </small>
          </div>
        ))}
      </div>
      <h3 className="modal-section-title">Limits that stay visible</h3>
      <p className="modal-prose">
        A small intersecting wind zone can raise the wind factor even when much
        of a territory is unexposed. Customers are not assumed uniformly
        distributed. Counts of exposed assets do not imply failure. Rankings use
        the full available advisory footprint, while the time slider reveals
        forecast positions. Confidence describes input coverage only: limited
        below 60%, moderate at 60–79%, high at 80% or more. It does not measure
        forecast skill.
      </p>
      <p className="fine-print">
        Administrators can configure the six weights through the server’s
        EXPOSURE_WEIGHTS setting. They must be nonnegative and sum to 100.
        Historical comparisons, scenario adjustments and validated outage
        modeling are outside this Phase 1 release.
      </p>
    </>
  );
}
function AlertsPanel({
  data,
  onSources,
}: {
  data: DashboardData | null;
  onSources: () => void;
}) {
  const issues = data?.sources.filter((s) => s.state !== "live") ?? [];
  return (
    <>
      <div className="source-intro">
        <Bell size={18} />
        <p>
          This Phase 1 center reports data-availability events. Utility
          threshold alerts, email, and SMS are not configured.
        </p>
      </div>
      {issues.length ? (
        issues.map((s) => (
          <div className="alert-card" key={s.id}>
            <TriangleAlert size={18} />
            <div>
              <span className="empty-eyebrow">
                DATA AVAILABILITY · {stateLabel(s.state).toUpperCase()}
              </span>
              <h3>{s.name}</h3>
              <p>{s.message}</p>
              <small>
                Checked {date(data?.fetchedAt)} · {s.attribution}
              </small>
            </div>
          </div>
        ))
      ) : (
        <div className="alerts-empty">
          <CheckCircle2 size={34} />
          <h3>
            {data
              ? "No data-availability alerts"
              : "Waiting for provider status"}
          </h3>
          <p>No utility impact alerts have been generated.</p>
        </div>
      )}
      <button className="secondary-button" onClick={onSources}>
        Manage data connections
        <ArrowRight size={14} />
      </button>
    </>
  );
}
