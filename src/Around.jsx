// "People around": people publicly connected to a found person (name, relation, proof only).
import { subKey } from "./useSubSearches.js";
import "./around.css";
import { webUrl } from "./safeUrl.js";

export const RELATIONS = {
  "co-author": "Co-authors",
  "co-director": "Co-directors",
  collaborator: "Collaborators",
  colleague: "Colleagues",
  "co-contributor": "Co-contributors",
  "mentioned in the same LinkedIn post": "Same LinkedIn post",
  "mutual follow": "Mutual follows",
  "fellow councillor": "Fellow councillors",
  "possible family": "Possible family",
  "named together": "Named together",
  ...Object.fromEntries(["X", "Bluesky", "Mastodon", "GitHub", "Instagram"].map(
    (p) => [`mentioned in ${p} bio`, `Mentioned in ${p} bio`])),
};
const ORDER = Object.keys(RELATIONS);

const repos = (close) => [...new Set(close.evidence.map((e) => e.url.match(/github\.com\/([^/?#]+\/[^/?#]+)/)?.[1])
  .filter(Boolean))].join(", ");
const LINKS = {
  "co-author": () => "co-authored a publication",
  "co-director": () => "co-directs a company",
  collaborator: (c) => `collaborator on ${repos(c) || "a GitHub repository"}`,
  colleague: () => "public member of the same GitHub organization",
  "co-contributor": (c) => `co-contributor on ${repos(c) || "the same GitHub repositories"}`,
  "mutual follow": (c, result) => `follow each other on ${via(c, result) || "a social network"}`,
  "fellow councillor": () => "sit on the same municipal council",
  "possible family": () => "possible family (same family name, written together)",
  "named together": () => "named together on the same page",
};
// The relation in plain words, e.g. "co-contributor on simonw/datasette".
export const linkText = (close, result) => (LINKS[close.relation]?.(close, result) ?? close.relation);

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; } };

function grouped(around) {
  const groups = {};
  for (const c of around) (groups[c.relation] ??= []).push(c);
  return Object.entries(groups).sort(([a], [b]) => {
    const ia = ORDER.indexOf(a); const ib = ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

function Evidence({ close }) {
  return (
    <ul className="a-evidence">
      {close.evidence.map((e) => (
        <li key={e.url + e.quote}>
          {e.quote && <q>{e.quote}</q>}
          <a href={webUrl(e.url)} target="_blank" rel="noreferrer noopener" className="mono">{host(e.url)} ↗</a>
        </li>))}
    </ul>
  );
}

// Searches the person on the same graph: a hub node grows from the person they were found around.
// `around` is absent inside a search around (one level only).
function SearchButton({ close, person, around }) {
  if (!around || !person) return null;
  const sub = around.subs[subKey(person.id, close.name)];
  const text = !sub || sub.status === "error" ? "Search on the graph"
    : sub.status === "draft" ? "Hints to confirm · see on the graph"
    : sub.status === "queued" ? "Waiting… · see on the graph"
      : sub.status === "running" ? `Searching… ${sub.pct}% · see on the graph`
        : sub.hidden ? "Show the search on the graph" : "See the search on the graph";
  return (
    <button type="button" className={`btn a-search${sub && sub.status !== "error" ? "" : " primary"}`}
      onClick={() => around.search(close, person)}
      title={close.hint ? `Searched with the hint “${close.hint}”, shown on this graph` : "Shown on this graph"}>
      {sub?.status === "running" && <span className="sub-spinner" aria-hidden="true" />}
      {text}
    </button>
  );
}

const via = (close, result) => [...new Set(close.profile_ids.map(
  (id) => result.profiles.find((p) => p.id === id)?.platform).filter(Boolean))].join(", ");

export function AroundList({ person, result, around }) {
  const people = person.around || [];
  if (!people.length) {
    return <p className="d-summary">No publicly connected people found for this person.</p>;
  }
  return (
    <>
      <p className="a-note">People publicly connected to this person. Only their name, the relation and the
        proof are kept: nothing else is looked up about them unless you search them. A search runs on this
        graph: it grows from this person.</p>
      {grouped(people).map(([relation, people]) => (
        <section key={relation} className="a-group">
          <h3 className="eyebrow">{RELATIONS[relation] ?? relation[0].toUpperCase() + relation.slice(1)} · {people.length}</h3>
          <ul className="a-list">
            {people.map((c) => (
              <li key={c.name + c.relation} className="a-item">
                <div className="a-head">
                  <span className="a-dot" aria-hidden="true" />
                  <b className="a-name">{c.name}</b>
                  <span className="a-strength mono">{c.strength} shared</span>
                </div>
                <p className="a-via mono">via {via(c, result)}</p>
                <Evidence close={c} />
                <SearchButton close={c} person={person} around={around} />
              </li>))}
          </ul>
        </section>))}
    </>
  );
}

export function CloseCard({ close, person, result, around }) {
  return (
    <>
      <p className="eyebrow">Person around · {RELATIONS[close.relation] ?? close.relation}</p>
      <h2 className="d-title">{close.name}</h2>
      <section className="a-link" aria-label="What links them">
        <p className="a-link-ends"><b>{person?.label}</b><span aria-hidden="true" className="a-link-line" />
          <b>{close.name}</b></p>
        <p className="a-link-rel">{linkText(close, result)}</p>
        <p className="a-link-meta mono">
          <span className="a-strength" title="How many shared items (papers, repos, posts...) link them">
            Strength {close.strength}</span> via {via(close, result)}
        </p>
      </section>
      <section>
        <h3 className="eyebrow">Proof</h3>
        <Evidence close={close} />
      </section>
      <p className="a-note">Only the name, the relation and the proof are kept about this person.</p>
      <SearchButton close={close} person={person} around={around} />
      {close.hint && <p className="a-hint mono">Hint: {close.hint}</p>}
    </>
  );
}
