"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { WheelEvent as ReactWheelEvent } from "react";
import L from "leaflet";
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer, useMap, useMapEvents } from "react-leaflet";

import { cn } from "@/lib/utils";

type AttackMapMarker = {
  key: string;
  ips: string[];
  country: string;
  lat: number;
  lon: number;
  label: string;
  detail: string;
  attackCount: number;
  averageRisk: number;
};

type ThreatCluster = {
  key: string;
  size: number;
  markers: AttackMapMarker[];
  ips: string[];
  label: string;
  country: string;
  countrySummary: string;
  attackCount: number;
  averageRisk: number;
  lat: number;
  lon: number;
};

type ActiveClusterOverlay = {
  cluster: ThreatCluster;
  point: { x: number; y: number };
};

const markerIcon = new L.Icon({
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

function buildClusterBadgeIcon(averageRisk: number, count: number) {
  const tone = averageRisk >= 70 ? "#fb7185" : averageRisk >= 40 ? "#facc15" : "#34d399";

  return L.divIcon({
    className: "threat-cluster-badge",
    html: `
      <div
        style="
          pointer-events:none;
          display:flex;
          align-items:center;
          justify-content:center;
          width:28px;
          height:28px;
          border-radius:999px;
          border:2px solid ${tone};
          background:rgba(15,23,42,0.92);
          color:#ffffff;
          font-size:12px;
          font-weight:700;
          box-shadow:0 8px 22px rgba(15,23,42,0.32);
        "
      >
        ${count}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function AttackMapInner({ markers }: { markers: AttackMapMarker[] }) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const hoverSuspendedUntilRef = useRef<number>(0);
  const [mapInstance, setMapInstance] = useState<L.Map | null>(null);
  const [activeCluster, setActiveCluster] = useState<ActiveClusterOverlay | null>(null);
  const [focusedMarkerKey, setFocusedMarkerKey] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const defendedAsset = {
    label: process.env.NEXT_PUBLIC_DEFENDED_ASSET_LABEL ?? "Protected Asset",
    lat: Number(process.env.NEXT_PUBLIC_DEFENDED_ASSET_LAT ?? 37.7749),
    lon: Number(process.env.NEXT_PUBLIC_DEFENDED_ASSET_LON ?? -122.4194),
  };
  const center = useMemo<[number, number]>(() => {
    if (markers.length === 0) {
      return [defendedAsset.lat, defendedAsset.lon];
    }

    const lat = (markers.reduce((total, marker) => total + marker.lat, 0) + defendedAsset.lat) / (markers.length + 1);
    const lon = (markers.reduce((total, marker) => total + marker.lon, 0) + defendedAsset.lon) / (markers.length + 1);
    return [lat, lon];
  }, [defendedAsset.lat, defendedAsset.lon, markers]);

  const clearCloseTimer = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  const scheduleClose = () => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setActiveCluster(null);
    }, 220);
  };

  const openClusterOverlay = (cluster: ThreatCluster, point: { x: number; y: number }) => {
    if (focusedMarkerKey || Date.now() < hoverSuspendedUntilRef.current) {
      return;
    }
    clearCloseTimer();
    setActiveCluster({ cluster, point });
  };

  useEffect(() => () => clearCloseTimer(), []);

  useEffect(() => {
    if (!mapInstance) {
      return;
    }

    const handlePopupClose = () => {
      setFocusedMarkerKey(null);
    };

    mapInstance.on("popupclose", handlePopupClose);
    return () => {
      mapInstance.off("popupclose", handlePopupClose);
    };
  }, [mapInstance]);

  useEffect(() => {
    if (!wrapperRef.current) {
      return;
    }

    const element = wrapperRef.current;
    const updateSize = () => {
      setContainerSize({
        width: element.clientWidth,
        height: element.clientHeight,
      });
    };

    updateSize();

    const observer = new ResizeObserver(() => {
      updateSize();
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!wrapperRef.current || !mapInstance) {
      return;
    }

    const wrapperElement = wrapperRef.current;
    const mapElement = mapInstance.getContainer();
    const handleWheel = (event: WheelEvent) => {
      const eventTarget = event.target;
      if (eventTarget instanceof Element && eventTarget.closest("[data-attack-map-overlay]")) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const direction = event.deltaY === 0 ? event.deltaX : event.deltaY;

      if (direction < 0) {
        mapInstance.zoomIn(1, { animate: true });
      } else if (direction > 0) {
        mapInstance.zoomOut(1, { animate: true });
      }
    };

    wrapperElement.style.overscrollBehavior = "contain";
    mapElement.style.overscrollBehavior = "contain";

    mapElement.addEventListener("wheel", handleWheel, { passive: false, capture: true });
    return () => {
      mapElement.removeEventListener("wheel", handleWheel, { capture: true });
    };
  }, [mapInstance]);

  const overlayPosition = useMemo(() => {
    if (!activeCluster || containerSize.width === 0 || containerSize.height === 0) {
      return null;
    }

    const panelWidth = Math.min(activeCluster.cluster.size > 1 ? 320 : 248, Math.max(220, containerSize.width - 24));
    const left = Math.max(12, containerSize.width - panelWidth - 12);
    const top = 12;

    return { left, top, width: panelWidth };
  }, [activeCluster, containerSize.height, containerSize.width]);

  const focusMarker = useCallback((marker: AttackMapMarker) => {
    clearCloseTimer();
    hoverSuspendedUntilRef.current = Date.now() + 1200;
    setActiveCluster(null);
    setFocusedMarkerKey(marker.key);

    if (!mapInstance) {
      return;
    }

    const targetZoom = Math.max(mapInstance.getZoom(), 11);
    const popup = L.popup({
      offset: L.point(0, -10),
      className: "attack-map-focus-popup",
      closeButton: false,
      autoClose: true,
    })
      .setLatLng([marker.lat, marker.lon])
      .setContent(renderMarkerPopupHtml(marker));

    mapInstance.flyTo([marker.lat, marker.lon], targetZoom, { animate: true, duration: 1 });
    mapInstance.once("moveend", () => {
      popup.openOn(mapInstance);
    });
  }, [mapInstance]);

  return (
    <div
      ref={wrapperRef}
      className="relative h-[400px] w-full overflow-hidden rounded-3xl overscroll-contain sm:h-[460px] xl:h-[520px]"
    >
      <MapContainer
        center={center}
        zoom={markers.length > 1 ? 2 : 3}
        scrollWheelZoom={false}
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapInstanceBridge onReady={setMapInstance} />
        <Marker position={[defendedAsset.lat, defendedAsset.lon]} icon={markerIcon}>
          <Popup>
            <div className="space-y-1 text-sm text-slate-900">
              <p className="font-semibold">{defendedAsset.label}</p>
              <p>Defended asset location</p>
            </div>
          </Popup>
        </Marker>
        <ClusteredThreatMarkers
          markers={markers}
          defendedAsset={defendedAsset}
          onClusterHover={openClusterOverlay}
          onClusterLeave={scheduleClose}
          onMapInteraction={() => setActiveCluster(null)}
        />
      </MapContainer>

      {activeCluster && overlayPosition ? (
        <div
          className="absolute z-[500] pointer-events-none"
          style={{ left: overlayPosition.left, top: overlayPosition.top, width: overlayPosition.width }}
        >
          <div
            className={cn(
              "pointer-events-auto max-h-[calc(100vh-220px)] overflow-hidden rounded-[18px] border border-white/10 bg-slate-950/94 p-2.5 shadow-[0_18px_36px_rgba(2,6,23,0.38)] backdrop-blur-xl",
              activeCluster.cluster.size > 1 ? "min-w-[240px]" : "min-w-[220px]",
            )}
            data-attack-map-overlay
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
          >
            <ClusterFlyout cluster={activeCluster.cluster} onSelectMarker={focusMarker} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function ClusteredThreatMarkers({
  markers,
  defendedAsset,
  onClusterHover,
  onClusterLeave,
  onMapInteraction,
}: {
  markers: AttackMapMarker[];
  defendedAsset: { label: string; lat: number; lon: number };
  onClusterHover: (cluster: ThreatCluster, point: { x: number; y: number }) => void;
  onClusterLeave: () => void;
  onMapInteraction: () => void;
}) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useMapEvents({
    zoomend: () => {
      setZoom(map.getZoom());
    },
    zoomstart: () => {
      onMapInteraction();
    },
    dragstart: () => {
      onMapInteraction();
    },
  });

  const clusters = useMemo(() => buildClusters(map, markers, zoom), [map, markers, zoom]);

  return (
    <>
      {clusters.map((cluster) => (
        <Fragment key={cluster.key}>
          <Polyline
            positions={[
              [cluster.lat, cluster.lon],
              [defendedAsset.lat, defendedAsset.lon],
            ]}
            pathOptions={{
              color: cluster.averageRisk >= 70 ? "#fb7185" : cluster.averageRisk >= 40 ? "#facc15" : "#34d399",
              weight: cluster.size > 1 ? 3 : 2,
              opacity: 0.8,
              dashArray: cluster.size > 1 ? "8 12" : "6 10",
              className: `attack-line ${riskClass(cluster.averageRisk)}`,
            }}
          />
          {cluster.size > 1 ? (
            <>
              <CircleMarker
                center={[cluster.lat, cluster.lon]}
                radius={Math.max(12, Math.min(22, 10 + cluster.size * 1.5))}
                interactive={false}
                pathOptions={{
                  color: cluster.averageRisk >= 70 ? "#fb7185" : cluster.averageRisk >= 40 ? "#facc15" : "#34d399",
                  fillColor: cluster.averageRisk >= 70 ? "#fb7185" : cluster.averageRisk >= 40 ? "#facc15" : "#34d399",
                  fillOpacity: 0.22,
                  weight: 2,
                }}
              />
              <Marker
                position={[cluster.lat, cluster.lon]}
                icon={buildClusterBadgeIcon(cluster.averageRisk, cluster.size)}
                eventHandlers={{
                  mouseover: () => {
                    const point = map.latLngToContainerPoint([cluster.lat, cluster.lon]);
                    onClusterHover(cluster, { x: point.x, y: point.y });
                  },
                  mouseout: () => {
                    onClusterLeave();
                  },
                  click: () => {
                    const bounds = L.latLngBounds(cluster.markers.map((marker) => [marker.lat, marker.lon] as [number, number]));
                    map.fitBounds(bounds.pad(0.8), { animate: true });
                  },
                }}
              >
                <Popup>
                  <div className="space-y-2 text-sm text-slate-900">
                    <p className="font-semibold">Threat cluster</p>
                    <p>{cluster.countrySummary}</p>
                    <p>{cluster.attackCount} attack path{cluster.attackCount === 1 ? "" : "s"} | avg risk {cluster.averageRisk}</p>
                    <p className="text-slate-600">{cluster.ips.join(", ")}</p>
                    <p className="text-xs text-slate-500">Click the marker to zoom into this cluster.</p>
                  </div>
                </Popup>
              </Marker>
            </>
          ) : (
            <CircleMarker
              center={[cluster.lat, cluster.lon]}
              radius={Math.max(8, Math.min(18, cluster.attackCount * 2))}
              eventHandlers={{
                mouseover: () => {
                  const point = map.latLngToContainerPoint([cluster.lat, cluster.lon]);
                  onClusterHover(cluster, { x: point.x, y: point.y });
                },
                mouseout: () => {
                  onClusterLeave();
                },
              }}
              pathOptions={{
                color: cluster.averageRisk >= 70 ? "#fb7185" : cluster.averageRisk >= 40 ? "#facc15" : "#34d399",
                fillColor: cluster.averageRisk >= 70 ? "#fb7185" : cluster.averageRisk >= 40 ? "#facc15" : "#34d399",
                fillOpacity: 0.35,
                weight: 2,
              }}
            >
              <Popup>
                <div className="space-y-2 text-sm text-slate-900">
                  <p className="font-semibold">{cluster.label}</p>
                  <p>{cluster.countrySummary}</p>
                  <p>{cluster.attackCount} attack path{cluster.attackCount === 1 ? "" : "s"} | avg risk {cluster.averageRisk}</p>
                  <p className="text-slate-600">{cluster.ips.join(", ")}</p>
                </div>
              </Popup>
            </CircleMarker>
          )}
        </Fragment>
      ))}
    </>
  );
}

function buildClusters(map: L.Map, markers: AttackMapMarker[], zoom: number): ThreatCluster[] {
  const cellSize = zoom <= 2 ? 110 : zoom <= 4 ? 80 : zoom <= 6 ? 60 : 40;
  const grouped = new Map<string, AttackMapMarker[]>();

  markers.forEach((marker) => {
    const projected = map.project(L.latLng(marker.lat, marker.lon), zoom);
    const key = `${Math.floor(projected.x / cellSize)}:${Math.floor(projected.y / cellSize)}`;
    const existing = grouped.get(key) ?? [];
    existing.push(marker);
    grouped.set(key, existing);
  });

  return [...grouped.entries()].map(([key, clusterMarkers]) => {
    const attackCount = clusterMarkers.reduce((total, marker) => total + marker.attackCount, 0);
    const attackWeight = clusterMarkers.reduce((total, marker) => total + Math.max(marker.attackCount, 1), 0);
    const averageRisk = Math.round(
      (clusterMarkers.reduce((total, marker) => total + (marker.averageRisk * Math.max(marker.attackCount, 1)), 0) / Math.max(attackWeight, 1)) * 10,
    ) / 10;
    const lat = clusterMarkers.reduce((total, marker) => total + marker.lat, 0) / clusterMarkers.length;
    const lon = clusterMarkers.reduce((total, marker) => total + marker.lon, 0) / clusterMarkers.length;
    const countrySummary = [...new Set(clusterMarkers.map((marker) => marker.country))].join(", ");

    return {
      key,
      size: clusterMarkers.length,
      markers: clusterMarkers,
      ips: [...new Set(clusterMarkers.flatMap((marker) => marker.ips))],
      label: clusterMarkers[0]?.label ?? "Suspicious activity cluster",
      country: clusterMarkers[0]?.country ?? "Unknown",
      countrySummary,
      attackCount,
      averageRisk,
      lat,
      lon,
    };
  });
}

function riskClass(averageRisk: number) {
  if (averageRisk >= 70) {
    return "attack-line--critical";
  }
  if (averageRisk >= 40) {
    return "attack-line--medium";
  }
  return "attack-line--low";
}

function ClusterFlyout({
  cluster,
  onSelectMarker,
}: {
  cluster: ThreatCluster;
  onSelectMarker: (marker: AttackMapMarker) => void;
}) {
  const entries = [...cluster.markers].sort((left, right) => {
    if (left.country === right.country) {
      return left.label.localeCompare(right.label);
    }
    return left.country.localeCompare(right.country);
  });

  function handleFlyoutWheel(event: ReactWheelEvent<HTMLDivElement>) {
    event.preventDefault();
    event.stopPropagation();

    const container = event.currentTarget;
    container.scrollTop += event.deltaY;
  }

  return (
    <div className="w-full text-slate-100">
      <p className="text-sm font-semibold text-white">
        {cluster.size > 1 ? `${cluster.size} grouped attack locations` : cluster.country}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {cluster.attackCount} attack path{cluster.attackCount === 1 ? "" : "s"} | avg risk {cluster.averageRisk}
      </p>
      {cluster.size > 1 ? (
        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] text-slate-500">Click a location to focus</p>
      ) : null}
      <div
        className="scrollbar-hidden mt-2.5 max-h-[260px] space-y-2 overflow-y-auto overscroll-contain pr-1"
        onWheel={handleFlyoutWheel}
      >
        {entries.map((marker) => (
          <button
            key={marker.key}
            type="button"
            onClick={() => onSelectMarker(marker)}
            className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition hover:border-cyan-300/30 hover:bg-cyan-500/[0.08]"
          >
            <div className="flex items-center justify-between gap-3">
              <p className="truncate text-sm font-semibold text-white">{marker.country}</p>
              <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                {marker.attackCount} path{marker.attackCount === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-1 text-[12px] leading-5 text-slate-300">{marker.label}</p>
            <p className="mt-1 break-all font-mono text-[10px] text-cyan-100">{marker.ips.join(", ")}</p>
            <p className="mt-1 text-[10px] text-slate-500">
              Location {marker.lat.toFixed(2)}, {marker.lon.toFixed(2)}
            </p>
          </button>
        ))}
      </div>
    </div>
  );
}

function MapInstanceBridge({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();

  useEffect(() => {
    onReady(map);
  }, [map, onReady]);

  return null;
}

function renderMarkerPopupHtml(marker: AttackMapMarker) {
  return `
    <div style="min-width:220px;padding:2px 0;color:#e2e8f0;">
      <div style="font-size:14px;font-weight:700;color:#ffffff;">${escapeHtml(marker.country)}</div>
      <div style="margin-top:4px;font-size:12px;color:#cbd5e1;">${escapeHtml(marker.label)}</div>
      <div style="margin-top:8px;font-size:12px;font-family:IBM Plex Mono, monospace;color:#67e8f9;">${escapeHtml(marker.ips.join(", "))}</div>
      <div style="margin-top:8px;font-size:11px;color:#94a3b8;">Location ${marker.lat.toFixed(2)}, ${marker.lon.toFixed(2)}</div>
    </div>
  `;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
