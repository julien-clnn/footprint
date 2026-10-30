import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./places.css";
import { webUrl } from "./safeUrl.js";

const LEVEL = { address: "Exact address", city: "City", region: "Region", country: "Country" };
const FRANCE = [[41.3, -5.2], [51.1, 9.6]];
const SHAPES = {
  departments: () => import("./geo/fr-departments.json"),
  regions: () => import("./geo/fr-regions.json"),
  countries: () => import("./geo/world.json"),
};

function layerOf(code) {
  if (/^FR-[\dAB]{2}$/.test(code)) return "departments";
  if (/^FR-[A-Z]{3}$/.test(code)) return "regions";
  return /^[A-Z]{2}$/.test(code) ? "countries" : null;
}

async function shapes(places) {
  const wanted = {};
  for (const p of places) {
    for (const code of p.areas ?? []) {
      const layer = layerOf(code);
      if (layer) (wanted[layer] ??= new Set()).add(code);
    }
  }
  const found = new Map();
  await Promise.all(Object.entries(wanted).map(async ([layer, codes]) => {
    const { default: geo } = await SHAPES[layer]();
    for (const f of geo.features) if (codes.has(f.properties.code)) found.set(f.properties.code, f);
  }));
  return found;
}

// Bounds of a shape's largest part: France is framed on the mainland, not with French Guiana.
function mainBounds(feature) {
  const g = feature.geometry;
  const polygons = g.type === "MultiPolygon" ? g.coordinates : [g.coordinates];
  const size = (b) => (b.getNorth() - b.getSouth()) * (b.getEast() - b.getWest());
  return polygons.map((poly) => L.latLngBounds(poly[0].map(([lon, lat]) => [lat, lon])))
    .reduce((a, b) => (size(b) > size(a) ? b : a));
}

// Leaflet writes a string tooltip as HTML: labels come from profiles, so they go in as text.
function textTooltip(label) {
  const node = document.createElement("span");
  node.textContent = label ?? "";
  return node;
}

const boundsOf = (layer) => layer.fitTo ?? (layer.getBounds ? layer.getBounds() : L.latLngBounds([layer.getLatLng()]));

// Areas are only drawn when there is no precise point for the place.
function drawn(place, features, map) {
  if (place.precision !== "region" && place.precision !== "country" && place.lat != null) {
    const address = place.precision === "address";
    return L.circleMarker([place.lat, place.lon], {
      radius: address ? 7 : 8, weight: 2, color: "#fff", fillOpacity: 1,
      fillColor: address ? "#E8590C" : "#4F46E5",
    }).bindTooltip(textTooltip(place.label)).addTo(map);
  }
  const parts = (place.areas ?? []).map((c) => features.get(c)).filter(Boolean);
  if (parts.length) {
    const layer = L.geoJSON({ type: "FeatureCollection", features: parts }, {
      style: { color: "#E8590C", weight: 1.5, fillColor: "#E8590C", fillOpacity: 0.12 + 0.3 * place.confidence },
    }).bindTooltip(textTooltip(place.label)).addTo(map);
    layer.fitTo = parts.map(mainBounds).reduce((a, b) => L.latLngBounds(a.getSouthWest(), a.getNorthEast()).extend(b));
    return layer;
  }
  if (place.lat == null) return null;
  return L.circle([place.lat, place.lon], {
    radius: place.precision === "country" ? 300000 : 60000, color: "#E8590C", weight: 1.5, fillOpacity: 0.2,
  }).bindTooltip(textTooltip(place.label)).addTo(map);
}

function PlaceMap({ places, active, onPick }) {
  const box = useRef(null);
  const view = useRef(null);
  const layers = useRef([]);

  useEffect(() => {
    const map = L.map(box.current, { scrollWheelZoom: false, zoomSnap: 0.5, attributionControl: true });
    // Standard OpenStreetMap tiles, toned down in places.css to match the UI.
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);
    map.fitBounds(FRANCE);
    view.current = map;
    const resize = new ResizeObserver(() => map.invalidateSize());
    resize.observe(box.current);
    return () => { resize.disconnect(); map.remove(); view.current = null; };
  }, []);

  useEffect(() => {
    let live = true;
    shapes(places).then((features) => {
      const map = view.current;
      if (!live || !map) return;
      layers.current.forEach((l) => l?.remove());
      layers.current = places.map((p, i) => {
        const layer = drawn(p, features, map);
        layer?.on("click", () => onPick(i));
        return layer;
      });
      const all = layers.current.filter(Boolean);
      if (all.length) {
        const bounds = all.map(boundsOf).reduce((a, b) => L.latLngBounds(a.getSouthWest(), a.getNorthEast()).extend(b));
        map.fitBounds(bounds, { padding: [24, 24], maxZoom: 12 });
      }
    });
    return () => { live = false; };
  }, [places, onPick]);

  useEffect(() => {
    const layer = layers.current[active];
    if (!layer || !view.current) return;
    if (layer instanceof L.CircleMarker && !(layer instanceof L.Circle)) {
      view.current.setView(layer.getLatLng(), 13);
    } else view.current.fitBounds(boundsOf(layer), { padding: [24, 24], maxZoom: 13 });
    layer.openTooltip?.();
  }, [active]);

  return <div className="pl-map" ref={box} role="region" aria-label="Map of places" />;
}

export default function Places({ person, result }) {
  const [active, setActive] = useState(null);
  const places = person.places ?? [];
  const platform = (id) => result.profiles.find((p) => p.id === id)?.platform ?? id;
  if (!places.length) return <p className="d-empty">No location clue found for this person.</p>;
  return (
    <>
      <PlaceMap places={places} active={active} onPick={setActive} />
      <p className="pl-legend">
        <span><i className="pl-key address" />Exact address</span>
        <span><i className="pl-key city" />City</span>
        <span><i className="pl-key area" />Region or country</span>
      </p>
      <ul className="pl-list">
        {places.map((p, i) => (
          <li key={`${p.label}-${i}`} className={active === i ? "active" : ""}>
            <button type="button" className="pl-head" onClick={() => setActive(i)}
              disabled={p.lat == null && !p.areas?.length}>
              <span className={`pl-level ${p.precision}`}>{LEVEL[p.precision]}</span>
              <span className="pl-label">{p.label}</span>
              <span className="pl-conf" title="Confidence">{Math.round(p.confidence * 100)}%</span>
            </button>
            {p.lat == null && !p.areas?.length && <span className="pl-nomap">Not located on the map</span>}
            <ul className="pl-evidence">
              {p.evidence.map((e, j) => (
                <li key={j}>
                  {e.kind} · <a href={webUrl(e.url)} target="_blank" rel="noreferrer">{platform(e.profile_id)}</a>
                  {" "}<span className="mono">{e.text}</span>
                  {e.quote && <q>{e.quote}</q>}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {places.some((p) => p.geocoder) && (
        <p className="pl-nomap">Geocoding: Base Adresse Nationale (France) and OpenStreetMap Nominatim.</p>
      )}
    </>
  );
}
