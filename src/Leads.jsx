import { useMemo, useState } from "react";
import { platformCode } from "./graph.js";
import { leadRows, normUrl, origin, reasonText, urlBits, usefulTitle, why } from "./leads.js";
import "./leads.css";
import { webUrl } from "./safeUrl.js";

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

const PAGES = new Set(["Web page", "Website", "Data broker", "Document"]);
const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text);

function Lead({ lead, name, selected, onOpen, onPerson }) {
  const p = lead.profile;
  // A web page's path ("/en/blog") is not a handle: only accounts on known sites get one.
  const bits = PAGES.has(p.platform) ? { label: "" } : urlBits(p.url);
  // A weak hit's display name is cut from its search title: only shown when the title says something.
  const title = usefulTitle(p) || (!lead.weak && p.display_name) || p.username || bits.label || host(p.url);
  const query = !p.extra?.pivot && p.extra?.query;
  return (
    <li className={`lead${selected ? " selected" : ""}`}>
      <span className="lead-code" aria-hidden="true">{platformCode(p.platform)}</span>
      <div className="lead-body">
        <p className="lead-site">
          <span>{p.platform}</span>
          <span className="mono">{host(p.url)}</span>
          {bits.label && title !== bits.label && <span className="mono lead-path">{bits.label}</span>}
          <span className={`lead-kind${lead.weak ? "" : " account"}`}>{lead.weak ? "search hit" : "account"}</span>
        </p>
        <button type="button" className="lead-title" onClick={() => onOpen(lead)}>{title}</button>
        {p.bio && <p className="lead-snippet">{p.bio}</p>}
        <p className="lead-why">
          {lead.hints.map((m) => <span key={m.kind + m.value} className="lead-hint">{m.value}</span>)}
          <span>{why(lead, name).filter((l) => !l.startsWith("Mentions your hint") && !l.startsWith("Same")).join(" · ")}</span>
          {query && <span className="lead-query mono" title={query}>{clip(query, 70)}</span>}
          {lead.near && (
            <button type="button" className="lead-near" onClick={() => onPerson(lead.near.personId)}>
              {reasonText(lead.near.detail)} · near {lead.near.label}
            </button>
          )}
        </p>
      </div>
      <a className="lead-open" href={webUrl(p.url)} target="_blank" rel="noreferrer" aria-label={`Open ${p.platform} result`}>↗</a>
    </li>
  );
}

// Hits of one site that show nothing of their own, folded into one row.
function LeadGroup({ group, selectedId, onOpen }) {
  const has = group.leads.some((l) => l.profile.id === selectedId);
  const [open, setOpen] = useState(has);
  const shown = open || has;
  return (
    <li className={`lead lead-group${has ? " selected" : ""}`}>
      <span className="lead-code" aria-hidden="true">{platformCode(group.platform)}</span>
      <div className="lead-body">
        <button type="button" className="lead-title lead-fold" aria-expanded={shown} onClick={() => setOpen(!shown)}>
          {group.platform} · {plural(group.leads.length, "result")} without the name
          <span className="lead-chevron" aria-hidden="true">{shown ? "▾" : "▸"}</span>
        </button>
        {!shown && (
          <p className="lead-snippet mono">
            {clip(group.leads.map((l) => urlBits(l.profile.url).label || normUrl(l.profile.url)).join(", "), 140)}
          </p>
        )}
        {shown && (
          <ul className="lead-items">
            {group.leads.map((l) => {
              const p = l.profile;
              const why = origin(p);
              return (
                <li key={p.id} className={selectedId === p.id ? "selected" : ""}>
                  <button type="button" className="lead-item mono" onClick={() => onOpen(l)}>
                    {urlBits(p.url).label || normUrl(p.url)}</button>
                  {why && <span className="lead-item-why" title={why}>{clip(why, 70)}</span>}
                  <a className="lead-item-open" href={webUrl(p.url)} target="_blank" rel="noreferrer"
                    aria-label={`Open ${p.platform} result`}>↗</a>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </li>
  );
}

function Categories({ leads, category, setCategory }) {
  const counts = useMemo(() => {
    const c = {};
    for (const l of leads) c[l.category] = (c[l.category] ?? 0) + 1;
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [leads]);
  return (
    <div className="leads-filter" role="group" aria-label="Filter by site category">
      <button type="button" className={`chip${category ? "" : " active"}`} onClick={() => setCategory(null)}>
        All · {leads.length}</button>
      {counts.map(([c, n]) => (
        <button key={c} type="button" className={`chip${category === c ? " active" : ""}`}
          onClick={() => setCategory(category === c ? null : c)}>{c} · {n}</button>
      ))}
    </div>
  );
}

// Results no person could claim, most likely first.
export default function Leads({ leads, name, selectedId, onOpen, onPerson }) {
  const [category, setCategory] = useState(null);
  const shown = useMemo(() => (category ? leads.filter((l) => l.category === category) : leads), [leads, category]);
  const rows = useMemo(() => leadRows(shown), [shown]);
  return (
    <section className="leads" aria-label="Leads to check">
      <header className="leads-head">
        <div>
          <p className="eyebrow">Leads to check · {leads.length}</p>
          <h2 className="leads-title">Results not tied to a person</h2>
          <p className="leads-sub">
            Unverified search hits and accounts found for “{name}” that no person in the graph could claim.
            Most likely first: a result that mentions one of your hints ranks higher.
          </p>
        </div>
        <Categories leads={leads} category={category} setCategory={setCategory} />
      </header>
      {shown.length === 0 && <p className="leads-empty">Nothing here.</p>}
      {shown.length > 0 && (
        <ol className="leads-list">
          {rows.map(({ lead, group }) => (lead
            ? <Lead key={lead.profile.id} lead={lead} name={name} selected={selectedId === lead.profile.id}
              onOpen={onOpen} onPerson={onPerson} />
            : <LeadGroup key={`group:${group.platform}`} group={group} selectedId={selectedId} onOpen={onOpen} />
          ))}
        </ol>
      )}
    </section>
  );
}
