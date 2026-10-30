import { useState } from "react";
import "./photos.css";
import { imageUrl } from "./safeUrl.js";

const tineye = (url) => `https://tineye.com/search?url=${encodeURIComponent(url)}`;
const yandex = (url) => `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(url)}`;
const osm = ({ lat, lon }) => `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=14/${lat}/${lon}`;
const isPublic = (url) => /^https?:\/\//.test(url);
const unique = (values) => [...new Set(values)];
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };
const where = (p) => (["Website", "Web page", "Document"].includes(p.platform) ? host(p.page_url) : p.platform);

function Thumb({ photo, className = "ph-img" }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className={`${className} ph-broken`} role="img" aria-label="Image unavailable">Image unavailable</span>;
  return <img className={className} src={imageUrl(photo.url)} alt={`${photo.kind} on ${photo.platform}`} loading="lazy"
    decoding="async" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

function SameGroups({ photos }) {
  const groups = unique(photos.map((p) => p.group).filter(Boolean))
    .map((g) => photos.filter((p) => p.group === g));
  if (!groups.length) return null;
  return (
    <section>
      <h3 className="eyebrow">Same photo reused</h3>
      <ul className="ph-groups">{groups.map((members) => (
        <li key={members[0].group} className="ph-group">
          <span className="ph-stack" aria-hidden="true">{members.slice(0, 4).map((p) => (
            <Thumb key={p.profile_id + p.url} photo={p} className="ph-mini" />))}</span>
          <span>
            <b>Same photo used on {unique(members.map(where)).join(", ")}</b>
            <span className="d-source">{members.length} copies · matched by image fingerprint</span>
          </span>
        </li>))}
      </ul>
    </section>
  );
}

function Exif({ exif }) {
  const items = [
    exif.camera && ["Camera", exif.camera],
    exif.taken_at && ["Taken", exif.taken_at],
    "lat" in exif && ["GPS", <a key="gps" href={osm(exif)} target="_blank" rel="noreferrer">
      {exif.place ? `${exif.place} · ` : ""}{exif.lat}, {exif.lon}</a>],
  ].filter(Boolean);
  if (!items.length) return <p className="ph-noexif">No EXIF metadata</p>;
  return (
    <dl className="ph-exif">{items.map(([k, v]) => (
      <div key={k} className={k === "GPS" ? "gps" : ""}><dt>{k}</dt><dd>{v}</dd></div>))}
    </dl>
  );
}

function PhotoCard({ photo }) {
  const searchable = isPublic(photo.url);
  const why = photo.url.startsWith("data:")
    ? "Picture inside a document: download it from the document to search it"
    : "Not a public image address (demo picture)";
  const open = (href) => ({ href, target: "_blank", rel: "noreferrer noopener" });
  return (
    <li className="ph-card">
      <a className="ph-frame" {...open(searchable ? photo.url : photo.page_url)}><Thumb photo={photo} /></a>
      <div className="ph-body">
        <p className="ph-kind">
          <span className="eyebrow">{photo.kind}</span>
          {photo.group && <span className="ph-tag" title="Same photo as on other accounts">Same photo #{photo.group}</span>}
        </p>
        <a className="ph-source" {...open(photo.page_url)}>{photo.platform} ↗</a>
        <Exif exif={photo.exif ?? {}} />
        <div className="ph-actions" aria-label="Search this image">
          {searchable ? <>
            <a className="ph-btn" {...open(tineye(photo.url))}>TinEye</a>
            <a className="ph-btn" {...open(yandex(photo.url))}>Yandex</a>
          </> : <span className="ph-btn disabled" title={why} aria-disabled="true">Search unavailable</span>}
        </div>
      </div>
    </li>
  );
}

export default function Photos({ person }) {
  const photos = person.photos ?? [];
  if (!photos.length) return <p className="d-empty">No photo found on this person's profiles and pages.</p>;
  const sorted = [...photos].sort((a, b) => (a.group ?? 99) - (b.group ?? 99));
  const sources = unique(photos.map((p) => p.profile_id)).length;
  return (
    <>
      <p className="ph-intro">{photos.length} photo{photos.length === 1 ? "" : "s"} from {sources} source{sources === 1 ? "" : "s"}.
        Same-photo matches compare image fingerprints (perceptual hash), never faces.
        “Search this image” opens TinEye or Yandex in a new tab.</p>
      <SameGroups photos={photos} />
      <section>
        <h3 className="eyebrow">All photos</h3>
        <ul className="ph-grid">{sorted.map((p) => <PhotoCard key={p.profile_id + p.url} photo={p} />)}</ul>
      </section>
    </>
  );
}
