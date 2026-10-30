import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { AroundList, CloseCard } from "./Around.jsx";
import { HubCard } from "./Subsearches.jsx";
import { edgeClass, personPhoto, UNATTRIBUTED, WEAK } from "./graph.js";
import { ExposureChips, exposedItems, exposureLevel } from "./exposure.jsx";
import { rankedPeople } from "./People.jsx";
import Photos from "./Photos.jsx";
import "./details.css";
import { imageUrl, webUrl } from "./safeUrl.js";

const Places = lazy(() => import("./Places.jsx"));

const LINK_TEXT = {
  declared: "Link published by the account owner",
  same_email: "Same public email",
  same_avatar: "Same profile photo",
  same_ssh_key: "Same public SSH key",
  same_phone: "Same phone number",
  same_url: "Same page",
  archived: "Archived copy (Wayback Machine)",
  same_username: "Same username (a lead, not a proof)",
  inferred: "Inferred by the AI",
};
const SUBTITLE = ["Location", "Organization", "Job title"];
const SHOWN_EXTRA = new Set(["weak", "snippet_only", "search_title", "match", "phones", "addresses", "phone_evidence",
  "photos", "page_images", "pdf_images", "tie"]);

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const humanize = (key) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

const SHORT = { GitHub: "GH", GitLab: "GL", LinkedIn: "IN", Bluesky: "BS", Mastodon: "MA", Website: "WWW" };

function initials(platform) {
  if (SHORT[platform]) return SHORT[platform];
  const words = platform.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return (words.length > 1 ? words[0][0] + words[1][0] : platform.slice(0, 2)).toUpperCase();
}

function Ext({ href, children }) {
  return <a href={webUrl(href)} target="_blank" rel="noreferrer">{children ?? href}</a>;
}

function Chips({ values }) {
  return <span className="d-chips">{values.map((v) => <span key={v} className="d-chip">{v}</span>)}</span>;
}

// The person's portrait, large: their profile photo, else their initials.
function Portrait({ url, name }) {
  const [broken, setBroken] = useState(null);
  if (url && broken !== url) return <img className="d-portrait" src={imageUrl(url)} alt="" referrerPolicy="no-referrer" onError={() => setBroken(url)} />;
  const letters = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return <span className="d-portrait empty" aria-hidden="true">{letters}</span>;
}

function Badge({ platform, avatar }) {
  const [broken, setBroken] = useState(false);
  if (avatar && !broken) return <img className="d-avatar" src={imageUrl(avatar)} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
  return <span className="d-badge" aria-hidden="true">{initials(platform)}</span>;
}

// Each phone with the reason it was kept and the words around it, to check by hand.
function PhoneProof({ phones, evidence }) {
  const proof = Object.fromEntries((evidence ?? []).map((e) => [e.value, e]));
  return (
    <span className="d-stack">{phones.map((p) => (
      <span key={p} className="d-phone">
        <span className="d-chip">{p}</span>
        {proof[p] && <span className="d-why">{proof[p].why}</span>}
        {proof[p]?.quote && <q>{proof[p].quote}</q>}
      </span>))}
    </span>
  );
}

const TIE_SOURCES = { registry: "company registry", site: "the organization's site", web: "a web search" };

// What the person is to an organization, the sentence that shows it and how it was checked.
function TieProof({ tie }) {
  const ids = [tie.siren && `SIREN ${tie.siren}`, tie.rna && `RNA ${tie.rna}`].filter(Boolean);
  return (
    <span className="d-stack">
      <span><span className="d-chip">{tie.label}</span> of {tie.org}{ids.length > 0 && ` (${ids.join(", ")})`}</span>
      {tie.quote && <q>{tie.quote}</q>}
      <span className="d-why">
        Read on {TIE_SOURCES[tie.source] ?? tie.source}; {tie.verified ? "checked" : "to check"}
      </span>
    </span>
  );
}

function Rows({ rows }) {
  return (
    <dl className="d-rows">{rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
  );
}

function Account({ profile }) {
  const x = profile.extra ?? {};
  const list = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const chips = (v) => (list(v).length ? <Chips values={list(v)} /> : null);
  const other = Object.entries(x)
    .filter(([k, v]) => !SHOWN_EXTRA.has(k) && v !== null && v !== "" && typeof v !== "boolean")
    .map(([k, v]) => [humanize(k), Array.isArray(v) ? v.map(String).join(", ")
      : typeof v === "object" ? Object.keys(v).join(", ") : String(v)])
    .filter(([, v]) => v);
  const rows = [
    ["Name", profile.display_name],
    ["Username", profile.username && <span className="mono">{profile.username}</span>],
    ["Bio", profile.bio],
    ["Location", chips(profile.location)], ["Organization", chips(profile.organization)],
    ["Role", x.tie && <TieProof tie={x.tie} />],
    ["Emails", chips(profile.emails)], ["Phones", list(x.phones).length > 0 && <PhoneProof phones={list(x.phones)} evidence={x.phone_evidence} />], ["Addresses", chips(x.addresses)],
    ["Websites", profile.websites.length > 0 && (
      <span className="d-stack">{profile.websites.map((w) => <Ext key={w} href={w} />)}</span>)],
    ...other,
    ["Found via", profile.found_via && <span className="mono">{profile.found_via}</span>],
    ["Source", profile.source && <span className="mono">{profile.source}</span>],
    ["Search result", x.search_title], ["Match", x.match],
  ].filter(([, value]) => value);
  return (
    <>
      <p className="eyebrow">{x.weak ? "Unverified hit" : "Account"}</p>
      <div className="d-head">
        <Badge platform={profile.platform} avatar={profile.avatar_url} />
        <div className="d-head-text">
          <h2 className="d-title">{profile.platform}</h2>
          <p className="d-url"><Ext href={profile.url} /></p>
        </div>
      </div>
      <Rows rows={rows} />
    </>
  );
}

function FactList({ person, result }) {
  const platform = (id) => result.profiles.find((p) => p.id === id)?.platform ?? id;
  if (!person.facts.length) return <p className="d-empty">Nothing extracted yet.</p>;
  return (
    <dl className="d-facts">{person.facts.map((f) => (
      <div key={f.category + f.value}>
        <dt className="eyebrow">{f.category}</dt>
        <dd>
          <span className="d-value">{f.value}</span>
          <span className="d-source">{f.profile_ids.map(platform).join(", ")}</span>
          {f.why && <span className="d-why">Kept because: {f.why}</span>}
          {f.quote && <q>{f.quote}</q>}
        </dd>
      </div>))}
    </dl>
  );
}

// Dated events, under what is known: when each account or detail appeared.
function Timeline({ person, result }) {
  if (!person.timeline.length) return null;
  const platform = (id) => result.profiles.find((p) => p.id === id)?.platform;
  return (
    <section>
      <h3 className="eyebrow">Over time</h3>
      <ol className="d-timeline">{person.timeline.map((e) => (
      <li key={e.date + e.label}>
        <time className="mono">{e.date}</time>
        <span>{e.label}</span>
        {platform(e.profile_id) && <span className="d-source">{platform(e.profile_id)}</span>}
      </li>))}
      </ol>
    </section>
  );
}

// Splits an exposure factor into text and chips (person facts found in it) and pulls
// out the "(Platform)" notes as sources.
function Factor({ text, person, result }) {
  const platforms = new Set(result.profiles.map((p) => p.platform));
  const sources = [];
  const clean = text.replace(/\s*\(([^()]+)\)/g, (all, inner) => {
    const names = inner.split(/,\s*/);
    if (!names.every((n) => platforms.has(n) || n === "Website")) return all;
    names.forEach((n) => !sources.includes(n) && sources.push(n));
    return "";
  });
  const values = [...new Set(person.facts.filter((f) => f.category !== "Name" && f.value.length > 2)
    .map((f) => f.value))].sort((a, b) => b.length - a.length);
  const parts = values.length ? clean.split(new RegExp(`(${values.map(escape).join("|")})`)) : [clean];
  if (!sources.length) {
    for (const f of person.facts) {
      if (f.category === "Name" || !clean.includes(f.value)) continue;
      for (const id of f.profile_ids) {
        const p = result.profiles.find((x) => x.id === id)?.platform;
        if (p && !sources.includes(p)) sources.push(p);
      }
    }
  }
  return (
    <li>
      <span className="d-factor">{parts.map((part, i) => (i % 2
        ? <span key={i} className="d-chip">{part}</span> : part))}</span>
      {sources.length > 0 && <span className="d-source">{sources.join(", ")}</span>}
    </li>
  );
}

function Overview({ person, result }) {
  return (
    <>
      {person.summary && <section><h3 className="eyebrow">AI summary</h3><p className="d-summary">{person.summary}</p></section>}
      {person.exposure_factors.length > 0 && <section>
        <h3 className="eyebrow">What is visible</h3>
        <ul className="d-visible">{person.exposure_factors.map((f) => (
          <Factor key={f} text={f} person={person} result={result} />))}</ul>
      </section>}
      {person.advice.length > 0 && <section>
        <h3 className="eyebrow">How to reduce it</h3>
        <ol className="d-advice">{person.advice.map((a) => <li key={a}>{a}</li>)}</ol>
      </section>}
      <section>
        <h3 className="eyebrow">Accounts</h3>
        <ul className="d-accounts">
          {person.profile_ids.map((id) => {
            const p = result.profiles.find((x) => x.id === id);
            return p && <li key={id}>
              <Badge platform={p.platform} />
              <Ext href={p.url}>{p.platform}</Ext>
              <span className="mono">{p.username || p.display_name}</span>
              {person.to_check?.includes(id) && <span className="d-tocheck" title="Attached by the AI with weak evidence">to check</span>}
            </li>;
          })}
        </ul>
      </section>
    </>
  );
}

const TABS = [["overview", "Overview"], ["facts", "Known"], ["places", "Places"], ["photos", "Photos"],
  ["around", "People around"]];

function Tabs({ tab, setTab, idBase }) {
  const refs = useRef([]);
  const onKey = (e, i) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    let next = step !== undefined ? (i + step + TABS.length) % TABS.length
      : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : null;
    if (next === null) return;
    e.preventDefault();
    setTab(TABS[next][0]);
    refs.current[next]?.focus();
  };
  useEffect(() => {
    const el = refs.current[TABS.findIndex(([k]) => k === tab)];
    const bar = el?.parentElement;
    if (!bar) return undefined;
    const reveal = () => {
      const left = el.offsetLeft - bar.offsetLeft;
      if (left < bar.scrollLeft) bar.scrollLeft = left;
      else if (left + el.offsetWidth > bar.scrollLeft + bar.clientWidth) bar.scrollLeft = bar.scrollWidth;
    };
    reveal();
    const resize = new ResizeObserver(reveal);
    resize.observe(bar);
    return () => resize.disconnect();
  }, [tab]);
  return (
    <div className="d-tabs" role="tablist" aria-label="Person details">
      {TABS.map(([k, label], i) => (
        <button key={k} ref={(el) => { refs.current[i] = el; }} type="button" role="tab"
          id={`${idBase}-tab-${k}`} aria-controls={`${idBase}-panel`} aria-selected={tab === k}
          tabIndex={tab === k ? 0 : -1} className={tab === k ? "active" : ""}
          onClick={() => setTab(k)} onKeyDown={(e) => onKey(e, i)}>{label}</button>))}
    </div>
  );
}

function PersonCard({ person, result, around, onHighlight, highlighted }) {
  const [tab, setTab] = useState("overview");
  const ranked = rankedPeople(result);
  const rank = ranked.findIndex((p) => p.id === person.id) + 1;
  const ids = new Set(person.profile_ids);
  const proven = result.links.filter((l) => ids.has(l.source) && ids.has(l.target)
    && edgeClass(l) === "proven").length;
  const subtitle = SUBTITLE.map((c) => person.facts.find((f) => f.category === c)?.value).filter(Boolean);
  const items = exposedItems(person, result.profiles);
  const level = exposureLevel(items);
  const idBase = `person-${person.id.replace(/[^\w-]/g, "")}`;
  return (
    <>
      <p className="eyebrow">Person · {rank} of {ranked.length}</p>
      <div className="d-person">
        <Portrait url={personPhoto(person, result.profiles)} name={person.label} />
        <div className="d-head-text">
          <h2 className="d-name">{person.label}</h2>
          {subtitle.length > 0 && <p className="d-sub">{subtitle.join(" · ")}</p>}
          <p className="d-meta">
            <span className={`d-score level-${level.key}`}
              title={`What a stranger can learn about this person (score ${person.exposure_score ?? "?"}/100)`}>
              {level.label}
            </span>
            <span className="mono">{plural(person.profile_ids.length, "profile")} · {plural(proven, "proven link")}</span>
          </p>
          <ExposureChips items={items} max={items.length} onPick={onHighlight} active={highlighted} />
        </div>
      </div>
      <Tabs tab={tab} setTab={setTab} idBase={idBase} />
      <div className="d-panel" role="tabpanel" id={`${idBase}-panel`} aria-labelledby={`${idBase}-tab-${tab}`}
        key={tab}>
        {tab === "overview" && <Overview person={person} result={result} />}
        {tab === "facts" && <><FactList person={person} result={result} /><Timeline person={person} result={result} /></>}
        {tab === "places" && (
          <Suspense fallback={<p className="d-empty">Loading map…</p>}>
            <Places person={person} result={result} />
          </Suspense>
        )}
        {tab === "photos" && <Photos person={person} />}
        {tab === "around" && <AroundList person={person} result={result} around={around} />}
      </div>
    </>
  );
}

function Changes({ changes }) {
  if (!changes) return null;
  const row = (c) => <li key={c.url}><Ext href={c.url}>{c.platform}</Ext> <span className="mono">{c.url}</span></li>;
  return (
    <section>
      <h3 className="eyebrow">Since the previous search · <span className="mono">{changes.previous_date?.replace("T", " ")}</span></h3>
      <p>{changes.added.length} new, {changes.removed.length} gone.</p>
      {changes.added.length > 0 && <><h4 className="d-sub-head">New</h4><ul className="d-list">{changes.added.map(row)}</ul></>}
      {changes.removed.length > 0 && <><h4 className="d-sub-head">Gone</h4><ul className="d-list">{changes.removed.map(row)}</ul></>}
    </section>
  );
}

function LinkCard({ link, result }) {
  const status = link.verified === true ? "checked by the verifier"
    : link.verified === false ? "weak according to the verifier" : null;
  const pct = Math.round(link.confidence * 100);
  const end = (id) => {
    const p = result.profiles.find((x) => x.id === id);
    return p ? <><b>{p.platform}</b> <span className="mono">{p.username || p.display_name || id}</span></>
      : <span className="mono">{id}</span>;
  };
  return (
    <>
      <p className="eyebrow">Link · <span className="mono">{link.kind}</span></p>
      <h2 className="d-title">{LINK_TEXT[link.kind] ?? link.kind}</h2>
      <p className="d-ends"><span>{end(link.source)}</span>
        <span className="d-arrow" aria-hidden="true">↕</span><span className="sr-only">and</span>
        <span>{end(link.target)}</span></p>
      <div className="d-confidence">
        <span className="eyebrow">Confidence</span>
        <span className="d-bar" role="img" aria-label={`${pct}%`}><span style={{ width: `${pct}%` }} /></span>
        <span className="mono">{pct}%</span>
      </div>
      {status && <p className={`d-status ${link.verified ? "ok" : "weak"}`}>{status}</p>}
      <section>
        <h3 className="eyebrow">Evidence</h3>
        <ul className="d-evidence">{link.evidence.map((e) => <li key={e}>{e}</li>)}</ul>
      </section>
    </>
  );
}

function LooseCard({ title, eyebrow, text, profiles }) {
  return (
    <>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="d-title">{title}</h2>
      <p className="d-summary">{text}</p>
      <section>
        <h3 className="eyebrow">{plural(profiles.length, "result")}</h3>
        <ul className="d-accounts">{profiles.map((p) => (
          <li key={p.id}><Badge platform={p.platform} /><Ext href={p.url}>{p.platform}</Ext>
            <span className="mono">{p.extra?.search_title || p.username || p.display_name || new URL(p.url).hostname}</span></li>))}
        </ul>
      </section>
    </>
  );
}

// `around`: searches on people around (absent for what a search around found: one level only).
export default function Details({ selected, result, onClose, around, hub, onHighlight, highlighted }) {
  useEffect(() => {
    if (!selected) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, onClose]);
  if (!selected) return null;
  const profile = result.profiles.find((p) => p.id === selected.id);
  const person = result.persons.find((p) => p.id === selected.id);
  const owned = new Set(result.persons.flatMap((p) => p.profile_ids));
  const loose = result.profiles.filter((p) => !owned.has(p.id));
  return (
    <aside className="details" aria-label="Details" key={selected.id}>
      <span className="d-handle" aria-hidden="true" />
      <button type="button" className="d-close" onClick={onClose} aria-label="Close details">×</button>
      {selected.link && <LinkCard link={selected.link} result={result} />}
      {profile && <Account profile={profile} />}
      {profile && selected.why?.length > 0 && <section>
        <h3 className="eyebrow">Why it is listed</h3>
        <ul className="d-evidence">{selected.why.map((w) => <li key={w}>{w}</li>)}</ul>
      </section>}
      {person && <PersonCard key={person.id} person={person} result={result} around={around}
        onHighlight={onHighlight} highlighted={highlighted} />}
      {selected.kind === "hub" && hub && <HubCard {...hub} person={result.persons.find((p) => p.id === hub.sub?.personId)} />}
      {selected.kind === "close" && <CloseCard close={selected.close} result={result} around={around}
        person={result.persons.find((p) => p.id === selected.personId)} />}
      {selected.id === WEAK && <LooseCard eyebrow="Search hits" title="Unverified search hits"
        text="Search results that name you or come from a name search, but whose page could not be
          read or checked. Low chance of being you: open each link to verify."
        profiles={loose.filter((p) => p.extra?.weak)} />}
      {selected.id === UNATTRIBUTED && <LooseCard eyebrow="Accounts" title="Unattributed accounts"
        text="Accounts found for this name that could not be tied to any of the people above."
        profiles={loose.filter((p) => !p.extra?.weak)} />}
      {selected.kind === "search" && <>
        <p className="eyebrow">Search</p>
        <h2 className="d-title">{result.name}</h2>
        <p className="d-meta"><span className="mono">{result.persons.length === 1 ? "1 person" : `${result.persons.length} people`} · {plural(result.profiles.length, "profile")} found</span></p>
        <Changes changes={result.changes} />
      </>}
      {selected.kind === "fact" && <>
        <p className="eyebrow">Shared detail</p>
        <h2 className="d-title">{selected.fact.category}</h2>
        <p><span className="d-chip">{selected.fact.value}</span></p>
        <p className="d-sub">Shown on {plural(selected.fact.profile_ids.length, "profile")} of this person.</p>
        {selected.fact.why && <p className="d-why">Kept because: {selected.fact.why}</p>}
        {selected.fact.quote && <q className="d-quote">{selected.fact.quote}</q>}
      </>}
    </aside>
  );
}
