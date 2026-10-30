import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Details from "./Details.jsx";
import Graph from "./Graph.jsx";
import Landing from "./Landing.jsx";
import Leads from "./Leads.jsx";
import People from "./People.jsx";
import Progress, { profilesSoFar, progress } from "./Progress.jsx";
import { SubTray } from "./Subsearches.jsx";
import { buildElements, mainPersons, UNATTRIBUTED, WEAK } from "./graph.js";
import { computeLeads, why } from "./leads.js";
import useSearch from "./useSearch.js";
import useSubSearches from "./useSubSearches.js";

const DEMO = "Jean Dupont";


function Logo() {
  return (
    <span className="logo">
      <span className="logo-mark" aria-hidden="true" />
      Footprint
    </span>
  );
}

function Toggle({ checked, onChange, children }) {
  return (
    <label className="toggle">
      <input type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
      {children}
    </label>
  );
}

const LEGEND = [
  ["proven", "Proven link (email, photo, SSH key, phone, owner link)"],
  ["inferred", "AI link, checked by a second AI"],
  ["weak", "AI link judged weak"],
  ["lead", "Same username (a lead, not a proof)"],
  ["shared", "Shared detail (email, employer, city)"],
];

export default function App() {
  const [query, setQuery] = useState({ name: "", hints: "" });
  const [selected, setSelectedState] = useState(null);
  const [highlight, setHighlight] = useState(null);  // {key, ids}: a detail shown on the graph
  const setSelected = useCallback((next) => { setHighlight(null); setSelectedState(next); }, []);
  const [showUnattributed, setShowUnattributed] = useState(true);
  const [showWeak, setShowWeak] = useState(true);
  const [showLogs, setShowLogs] = useState(false);
  const [showShared, setShowShared] = useState(true);
  const [showWeakLinks, setShowWeakLinks] = useState(false);
  const [showAround, setShowAround] = useState(false);
  const [mobileView, setMobileView] = useState("graph");
  const [home, setHome] = useState(true);
  const { start, cancel, steps, logs, result, error, running, startedAt, endedAt } = useSearch();
  const [allSteps, setAllSteps] = useState([]);
  const around = useSubSearches(result, true);
  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then((h) => setAllSteps(h.steps)).catch(() => {});
  }, []);
  // Public demo: the only search is the recorded run on the fictional Jean Dupont.
  const demo = () => {
    setSelected(null);
    setQuery({ name: DEMO, hints: "" });
    setHome(false);
    start(DEMO, "", true);
  };
  const leads = useMemo(
    () => (result ? computeLeads(result, { showWeak, showUnattributed }) : []),
    [result, showUnattributed, showWeak],
  );
  // Searches around, with their progress in one number. The graph is rebuilt only when what it
  // shows changes (status, phase, %, shown or hidden), not on every log line.
  const subs = useMemo(() => Object.values(around.subs).map((s) => ({
    ...s, ...progress(allSteps, s.steps, s.status === "running"), found: profilesSoFar(s.logs),
  })), [around.subs, allSteps]);
  const subsByKey = useMemo(() => Object.fromEntries(subs.map((s) => [s.key, s])), [subs]);
  const drawn = subs.map((s) => [s.key, s.status, s.phase, s.pct, s.hidden].join("·")).join("|");
  const subsRef = useRef(subs);
  subsRef.current = subs;
  const elements = useMemo(() => {
    if (!result) return null;
    return buildElements(result, { showUnattributed: false, showShared, showWeak: false, showAround,
      showWeakLinks }, subsRef.current);
  }, [result, showShared, showAround, showWeakLinks, drawn]);  // eslint-disable-line react-hooks/exhaustive-deps
  const openHub = (key) => { setSelected({ id: `sub:${key}`, kind: "hub", key }); setMobileView("graph"); };
  const aroundActions = {
    subs: subsByKey,
    search: (close, person) => openHub(around.request(close, person)),
  };
  const hubKey = selected?.kind === "hub" ? selected.key : null;
  const hub = hubKey && {
    sub: subsByKey[hubKey], onRetry: around.retry, onStart: around.start,
    onCancel: (key) => { around.cancel(key); setSelected(null); },
    onPick: (id) => setSelected({ id: `sub:${hubKey}/${id}`, kind: "person", sub: hubKey, origId: id }),
  };
  // What a search around found opens with its own result, without "search on the graph" (one level).
  const subResult = selected?.sub ? subsByKey[selected.sub]?.result : null;
  const openLead = (lead) => setSelected({ id: lead.profile.id, kind: "account", why: why(lead, result.name) });
  const leadsCount = leads.length;
  const onSelect = useCallback((data) => {
    if (data?.toggle) around.toggle(data.key);  // a finished search around: show / hide it
    else setSelected(data);
  }, [around.toggle, setSelected]);
  const onHighlight = (item) => setHighlight((h) => (h?.key === item.key ? null : { key: item.key, ids: item.ids }));
  const pick = (id) => {
    if (id === WEAK || id === UNATTRIBUTED) {
      setSelected(null);
      setShowWeak(true);
      setShowUnattributed(true);
      setMobileView("leads");
      return;
    }
    setSelected({ id, kind: "person" });
    setMobileView("graph");
  };

  if (!home && (running || (!result && startedAt))) {
    return (
      <div className="app">
        <Progress allSteps={allSteps} steps={steps} logs={logs} running={running} result={result}
          startedAt={startedAt} endedAt={endedAt} name={query.name} hints={query.hints}
          error={error} onCancel={cancel} onBack={() => setHome(true)} logo={<Logo />} />
      </div>
    );
  }

  if (home || !result) {
    return (
      <div className="app">
        <header className="topbar">
          <Logo />
        </header>
        {error && <p className="error" role="alert">{error}</p>}
        <Landing onDemo={demo} />
      </div>
    );
  }

  return (
    <div className={`app results view-${mobileView}`}>
      <aside className="sidebar">
        <Logo />
        <div className="side-search">
          <label className="field">
            <span className="field-icon" aria-hidden="true" />
            <input value={result.name} readOnly aria-label="Searched name" />
          </label>
        </div>
        <People result={result} selectedId={selected?.kind === "person" ? selected.id : null} onPick={pick}
          others={leadsCount} />
        <section className="legend" aria-label="Link types">
          <h2 className="eyebrow">Links</h2>
          <ul>{LEGEND.map(([cls, text]) => <li key={cls} className={`l-${cls}`}>{text}</li>)}</ul>
        </section>
      </aside>

      <header className="toolbar">
        <div className="mobile-head">
          <Logo />
          <span className="mobile-name">{result.name}</span>
        </div>
        <nav className="mobile-tabs" aria-label="View">
          {["graph", "list", "leads", "filters"].map((v) => (
            <button key={v} type="button" className={`chip${mobileView === v ? " active" : ""}`}
              onClick={() => setMobileView(v)}>{{ graph: "Graph", list: "List", leads: "Others", filters: "Filters" }[v]}
              {v === "leads" && <span className="count">{leadsCount}</span>}</button>
          ))}
        </nav>
        <div className="toggles">
          <Toggle checked={showWeakLinks} onChange={setShowWeakLinks}>Weak links</Toggle>
          <Toggle checked={showShared} onChange={setShowShared}>Shared details</Toggle>
          <Toggle checked={showAround} onChange={setShowAround}>People around</Toggle>
          <Toggle checked={showLogs} onChange={setShowLogs}>Logs</Toggle>
        </div>
        <div className="toolbar-actions">
          <button type="button" className="btn primary" onClick={() => { setSelected(null); setHome(true); }}>
            Back
          </button>
        </div>
      </header>

      <main className="stage">
        <Graph elements={elements} layoutKey={result} onSelect={onSelect} focusId={selected?.id ?? null}
          highlight={highlight?.ids ?? null} />
        {mobileView === "leads" && (
          <Leads leads={leads} name={result.name} selectedId={selected?.id}
            onOpen={openLead} onPerson={pick} />
        )}
        <div className="stage-bar">
          <div className="seg" role="group" aria-label="View">
            <button type="button" className={mobileView !== "leads" ? "active" : ""}
              onClick={() => setMobileView("graph")}>Graph</button>
            <button type="button" className={mobileView === "leads" ? "active" : ""}
              onClick={() => setMobileView("leads")}>Other results<span className="count">{leadsCount}</span></button>
          </div>
        </div>
        <p className="statusline">
          {mainPersons(result).length} main people · {leadsCount} other results · {result.profiles.length} profiles
          {endedAt - startedAt >= 1000 ? ` · finished in ${Math.round((endedAt - startedAt) / 1000)} s` : ""}
          {result.changes ? ` · +${result.changes.added.length} new since ${result.changes.previous_date?.slice(0, 10)}` : ""}
        </p>
        {mobileView !== "leads" && <SubTray subs={subs} onOpen={openHub} onToggle={around.toggle}
          onCancel={(key) => { around.cancel(key); if (hubKey === key) setSelected(null); }} />}
        <Details selected={selected && (selected.origId ? { ...selected, id: selected.origId } : selected)}
          result={subResult ?? result} onClose={() => setSelected(null)}
          around={selected?.sub ? undefined : aroundActions} hub={hub}
          onHighlight={onHighlight} highlighted={highlight?.key} />
        {showLogs && (
          <pre className="logs">
            {logs.map((l) => `[${l.step}] ${l.message}`).join("\n")}
            {result.errors.length ? "\n\nErrors:\n" + result.errors.join("\n") : ""}
          </pre>
        )}
      </main>
    </div>
  );
}
