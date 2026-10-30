// Searches on people around: the tray over the graph and the card of a hub node.
import { useState } from "react";
import { exposedItems, exposureLevel } from "./exposure.jsx";
import { mainPersons, platformCode } from "./graph.js";
import { describe, sourceRows, useNow } from "./Progress.jsx";
import { FIELDS } from "./useSubSearches.js";
import "./subsearches.css";
import { webUrl } from "./safeUrl.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const clock = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// The name a search found: the full name a page proved for a first name alone.
export const foundName = (sub) => sub.result?.name || sub.name;
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

function summary(sub, now) {
  if (sub.status === "draft") return "Hints to confirm";
  if (sub.status === "queued") return "Waiting for a free slot";
  if (sub.status === "running") {
    return `${sub.phase} · ${plural(sub.found, "profile")} so far · ${clock(now - sub.startedAt)}`;
  }
  if (sub.status === "error") return sub.error || "The search stopped";
  const people = mainPersons(sub.result).length;
  return `${plural(people, "person")} · ${plural(sub.result.profiles.length, "profile")}`
    + (sub.hidden ? " · hidden" : "");
}

function Eye({ off }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8 12.1 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
      {off && <path d="M2.5 13.5 13.5 2.5" />}
    </svg>
  );
}

// Floating list over the graph: what runs, what waits, what was added (show / hide each one).
export function SubTray({ subs, onOpen, onToggle, onCancel }) {
  const [folded, setFolded] = useState(false);
  const busy = subs.some((s) => s.status === "running");
  const now = useNow(busy);
  if (!subs.length) return null;
  const running = subs.filter((s) => s.status === "running").length;
  const waiting = subs.filter((s) => s.status === "queued").length;
  return (
    <section className={`sub-tray${folded ? " folded" : ""}`} aria-label="Searches around">
      <button type="button" className="sub-tray-head" aria-expanded={!folded} onClick={() => setFolded((f) => !f)}>
        {busy && <span className="sub-spinner" aria-hidden="true" />}
        <span className="eyebrow">Searches around · {subs.length}</span>
        {running + waiting > 0 && <span className="sub-live">
          {[running && `${running} running`, waiting && `${waiting} waiting`].filter(Boolean).join(" · ")}</span>}
        <span className="sub-chevron" aria-hidden="true" />
      </button>
      {!folded && (
        <ul>
          {subs.map((sub) => (
            <li key={`${sub.key}-${sub.status}`} className={`sub-row ${sub.status}${sub.hidden ? " hidden" : ""}`}>
              <button type="button" className="sub-main" onClick={() => onOpen(sub.key)}
                title="Show on the graph">
                <span className="sub-dot" aria-hidden="true" />
                <span className="sub-text">
                  <span className="sub-name">{foundName(sub)}</span>
                  <span className="sub-sum" aria-live={sub.status === "running" ? "off" : "polite"}>
                    {summary(sub, now)}</span>
                </span>
              </button>
              {sub.status === "done" && (
                <button type="button" className="sub-icon" onClick={() => onToggle(sub.key)}
                  aria-pressed={!sub.hidden} title={sub.hidden ? "Show on the graph" : "Hide from the graph"}
                  aria-label={`${sub.hidden ? "Show" : "Hide"} the search on ${sub.name}`}>
                  <Eye off={sub.hidden} />
                </button>
              )}
              {["running", "queued", "error", "draft"].includes(sub.status) && (
                <button type="button" className="sub-icon" onClick={() => onCancel(sub.key)}
                  title={sub.status === "error" ? "Remove" : "Cancel the search"}
                  aria-label={`${sub.status === "error" ? "Remove" : "Cancel"} the search on ${sub.name}`}>×</button>
              )}
              {sub.status === "running" && (
                <span className="sub-bar" aria-hidden="true"><span style={{ width: `${Math.max(sub.pct, 4)}%` }} /></span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// The hints of a search on a first name alone, read from the page that names them: editable,
// the search starts once confirmed.
function HintsForm({ sub, onStart }) {
  const [fields, setFields] = useState(() => ({ ...sub.fields }));
  const [other, setOther] = useState(sub.other ?? "");
  const [loaded, setLoaded] = useState(!sub.loadingHints);
  if (!loaded && !sub.loadingHints) {  // the hints arrived: fill the form once
    setLoaded(true); setFields({ ...sub.fields }); setOther(sub.other ?? "");
  }
  const submit = (e) => { e.preventDefault(); onStart(sub.key, fields, other); };
  return (
    <form className="hub-hints" onSubmit={submit} aria-label="Hints of the search">
      <p className="d-sub">Known by a first name only: the search puts it next to what ties them to this
        person. {sub.loadingHints ? "Reading the page that names them…" : "Hints read from the page that names them; edit them if needed."}</p>
      {FIELDS.map(([k, label]) => (
        <label key={k} className="hub-field"><span className="eyebrow">{label}</span>
          <input value={fields[k] ?? ""} onChange={(e) => setFields((f) => ({ ...f, [k]: e.target.value }))}
            disabled={sub.loadingHints} /></label>))}
      <label className="hub-field"><span className="eyebrow">Other hints</span>
        <input value={other} onChange={(e) => setOther(e.target.value)} disabled={sub.loadingHints}
          placeholder="job, username, email…" /></label>
      <button type="submit" className="btn primary" disabled={sub.loadingHints}>Start the search</button>
    </form>
  );
}

// What ties the person searched to the person they were found around, and the proof.
function Tie({ sub, person }) {
  if (!sub.relation) return null;
  return (
    <section className="a-link" aria-label="What links them">
      <p className="a-link-ends"><b>{person?.label}</b><span aria-hidden="true" className="a-link-line" />
        <b>{foundName(sub)}</b></p>
      <p className="a-link-rel">{sub.relation}</p>
      <ul className="a-evidence">
        {(sub.evidence ?? []).map((e) => (
          <li key={e.url + e.quote}>{e.quote && <q>{e.quote}</q>}
            <a href={webUrl(e.url)} target="_blank" rel="noreferrer noopener" className="mono">{host(e.url)} ↗</a></li>))}
      </ul>
    </section>
  );
}

// Details panel of a hub node: the search's progress, then who it found.
export function HubCard({ sub, person, onCancel, onRetry, onPick, onStart }) {
  const now = useNow(sub?.status === "running");
  if (!sub) return <p className="d-empty">This search was cancelled.</p>;
  const latest = sourceRows(sub.logs).filter((r) => r.count > 0).slice(-3).reverse();
  const result = sub.status === "done" ? sub.result : null;
  return (
    <>
      <p className="eyebrow">Search around{person ? ` ${person.label}` : ""}</p>
      <h2 className="d-title">{foundName(sub)}</h2>
      {result?.searched_name && result.name_proof && (
        <p className="d-sub">Searched as “{result.searched_name}”: the family name is written on <a
          href={webUrl(result.name_proof.url)} target="_blank" rel="noreferrer noopener" className="mono">
          {host(result.name_proof.url)} ↗</a>{result.name_proof.quote && <> · <q>{result.name_proof.quote}</q></>}</p>)}
      {result?.first_name_only && <p className="d-sub hub-tocheck">No page shows the family name: everything
        found is to check.</p>}
      {sub.hints && sub.status !== "draft" && <p className="d-sub">Hint: {sub.hints}</p>}
      <Tie sub={sub} person={person} />
      {sub.status === "draft" && <HintsForm key={sub.key} sub={sub} onStart={onStart} />}

      {sub.status === "queued" && <p className="d-summary">Waiting: two searches already run. It starts as soon
        as one ends.</p>}
      {sub.status === "running" && (
        <section className="hub-progress" aria-label="Progress">
          <p className="hub-phase"><span className="sub-spinner" aria-hidden="true" />{sub.phase}
            <span className="mono">{sub.pct}% · {clock(now - sub.startedAt)}</span></p>
          <span className="sub-bar big" aria-hidden="true"><span style={{ width: `${Math.max(sub.pct, 4)}%` }} /></span>
          <p className="d-sub">{plural(sub.found, "profile")} found so far. The graph grows around this node when
            the search ends; you can keep exploring meanwhile.</p>
          {latest.length > 0 && (
            <ul className="hub-latest">
              {latest.map((r) => {
                const { label, code, detail } = describe(r);
                return (
                  <li key={`${r.key}-${r.order}`}>
                    <span className="focus-code" aria-hidden="true">{code}</span>
                    <span className="hub-latest-name">{label}</span>
                    {detail && <span className="mono">{detail}</span>}
                  </li>);
              })}
            </ul>
          )}
        </section>
      )}
      {sub.status === "error" && <p className="searching-error" role="alert">{sub.error}</p>}
      {sub.status === "done" && (
        <section aria-label="People found">
          <p className="d-sub">{sub.hidden ? "Hidden from the graph." : "Shown on the graph."} Click its violet
            node to {sub.hidden ? "show" : "hide"} it.</p>
          <h3 className="eyebrow">Found · {plural(sub.result.profiles.length, "profile")}</h3>
          <ul className="hub-people">
            {mainPersons(sub.result).map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => onPick(p.id)} disabled={sub.hidden}>
                  <b>{p.label}</b>
                  <span className="mono">{exposureLevel(exposedItems(p, sub.result.profiles)).label} · {plural(p.profile_ids.length, "profile")}</span>
                  <span className="hub-codes" aria-hidden="true">
                    {[...new Set(p.profile_ids.map((id) => sub.result.profiles.find((x) => x.id === id)?.platform))]
                      .filter(Boolean).slice(0, 6).map((pl) => <span key={pl}>{platformCode(pl)}</span>)}
                  </span>
                </button>
              </li>))}
          </ul>
        </section>
      )}

      <div className="hub-actions">
        {sub.status === "error" && <button type="button" className="btn primary" onClick={() => onRetry(sub.key)}>
          Retry</button>}
        {(sub.status === "running" || sub.status === "queued") && (
          <button type="button" className="btn" onClick={() => onCancel(sub.key)}>Cancel the search</button>)}
        {sub.status === "draft" && <button type="button" className="btn" onClick={() => onCancel(sub.key)}>
          Cancel</button>}
      </div>
    </>
  );
}
