import { useEffect, useRef, useState } from "react";
import { platformCode } from "./graph.js";
import "./progress.css";

const COUNTED = /(\d+) (?:new )?(?:profile|account)\(s\)/;
const FOUND = /(\d+) (?:new )?(?:profile|account|result)\(s\)/;
const BLOCKED = /\b(failed|blocked|captcha|error|forbidden|timed? ?out|HTTP [45]\d\d|\b40[13]\b|\b429\b)/i;

export function profilesSoFar(logs) {
  return logs
    .filter((l) => l.step === "collect" || l.step === "expand")
    .reduce((sum, l) => sum + Number(COUNTED.exec(l.message)?.[1] ?? 0), 0);
}

export function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

const isBlocked = (message) => BLOCKED.test(message);

const SOURCE_STEPS = new Set(["collect", "expand"]);
const plural = (text) => text.replace(/\b(\d+) (new )?(\w+)\(s\)/g, (_, n, nw = "", w) => `${n} ${nw}${w}${n === "1" ? "" : "s"}`);

// Turns a collect/expand log line into a table row: "{source}: {detail}" or
// "Round n · {source}: {detail}". "usernames a, b" / "web search for x" keep the list as detail.
function parseLog(log) {
  const message = log.message.replace(/^Round \d+ · /, "");
  const cut = message.indexOf(": ");
  let name = cut > 0 ? message.slice(0, cut) : message;
  let detail = cut > 0 ? message.slice(cut + 2).replace(/ \(demo fixtures\)$/, "") : "";
  const list = /^(.*?\b(?:usernames|for))\s+(.+)$/.exec(name);
  if (list) {
    name = list[1];
    detail = `${list[2]} · ${detail}`;
  }
  const count = FOUND.exec(detail)?.[1];
  const skipped = /^Skipped\b/.test(message);
  return {
    key: log.source ?? `${log.step}:${name}`,
    name,
    detail: plural(detail),
    count: count === undefined ? null : Number(count),
    state: skipped ? "skipped" : isBlocked(log.message) ? "blocked" : "done",
  };
}

export function sourceRows(logs) {
  const rows = new Map();
  logs.forEach((log, i) => {
    if (!SOURCE_STEPS.has(log.step) || /^Round \d+: /.test(log.message)) return;
    const row = parseLog(log);
    rows.delete(row.key);
    rows.set(row.key, { ...row, order: i });
  });
  return [...rows.values()];
}

// The 13 pipeline steps, told as 4 phases a person can follow.
const PHASES = [
  { label: "Finding", title: "Finding public accounts", steps: ["parse_hints", "collect", "expand", "first_name"] },
  { label: "Who is who", title: "Telling you apart from your namesakes", steps: ["resolve", "attach", "verify", "cores"] },
  { label: "Deeper", title: "Digging deeper", steps: ["investigate", "deepen", "orgs", "regroup"] },
  { label: "Report", title: "Writing the report", steps: ["score", "places", "around"] },
];
const LATEST = 3;

// Plain words for the expand step's log lines, shown in the latest finds. Platforms keep their name.
// [pattern on the source name, label, code, keep the detail (lists of usernames or search terms)]
const WORDS = [
  [/^usernames$/i, "Same username elsewhere", "@", true],
  [/^guessed usernames$/i, "Usernames guessed from the name", "@", true],
  [/^web search for$/i, "Web search", "WEB", true],
  [/^web search\b/i, "Web search", "WEB"],
  [/declared links/i, "Links on their own pages", "LNK"],
  [/^github commits/i, "Emails in GitHub commits", "GH"],
  [/^emails\b/i, "Accounts tied to an email", "@"],
  [/^data breaches/i, "Data breaches", "DB"],
  [/^keybase/i, "Keybase proofs", "KB"],
  [/^personal sites/i, "Personal sites and archives", "ARC"],
  [/^documents/i, "Documents and READMEs", "DOC"],
  [/^ssh keys/i, "SSH keys", "SSH"],
  [/^read \d+ web page/i, "Web pages read", "WEB"],
  [/^ai search ideas/i, "Searches suggested by the AI", "AI"],
];

export function describe(row) {
  const count = row.count === null ? "" : `${row.count} found`;
  const hit = WORDS.find(([re]) => re.test(row.name));
  if (!hit) return { label: row.name, code: platformCode(row.name), detail: count || row.detail };
  const [, label, code, keep] = hit;
  return { label, code, detail: keep ? row.detail.replace(/"/g, "") : count };
}

// Each phase with its share done; a step the backend adds later joins the phase of the step before it.
export function phases(allSteps, steps, running) {
  const at = {};
  let last = 0;
  allSteps.forEach((s) => {
    const i = PHASES.findIndex((p) => p.steps.includes(s.id));
    last = i >= 0 ? i : last;
    (at[last] ??= []).push(s.id);
  });
  return PHASES.map((p, i) => {
    const ids = at[i] ?? [];
    const status = (id) => steps[id]?.status ?? "pending";
    const done = ids.filter((id) => status(id) === "done").length;
    const busy = ids.some((id) => status(id) === "running");
    const share = ids.length ? (done + (busy ? 0.5 : 0)) / ids.length : 0;
    const state = ids.length && done === ids.length ? "done" : busy || done ? (running ? "running" : "stopped") : "pending";
    return { ...p, share, state, size: ids.length };
  });
}

// One number for a search: its share done and the phase it is in.
export function progress(allSteps, steps, running) {
  const parts = phases(allSteps, steps, running);
  const share = parts.reduce((sum, p) => sum + p.share, 0) / parts.length;
  const current = parts.find((p) => p.state === "running") ?? parts.find((p) => p.state !== "done");
  return { pct: Math.round(share * 100), phase: current?.label ?? parts.at(-1).label };
}

// What happens now, in a few words that change while the search runs, so a long phase never looks stuck.
const TIPS = {
  Finding: ["Checking dozens of public sources at once", "Looking for the same username on other sites",
    "Following the links people put on their own pages"],
  "Who is who": ["Comparing photos, emails and usernames", "A second AI double-checks each link",
    "Setting namesakes apart"],
  Deeper: ["Following the leads the first pass opened", "Reading personal sites and documents"],
  Report: ["Scoring how exposed each person is", "Placing the places on a map", "Listing the people publicly around"],
};
const SLOW_S = 90;

function Tip({ phase, seconds }) {
  const tips = TIPS[phase] ?? [];
  const i = Math.floor(seconds / 5) % Math.max(tips.length, 1);
  const text = seconds > SLOW_S && Math.floor(seconds / 5) % 3 === 2
    ? "Still working: common names and many accounts take longer" : tips[i];
  if (!text) return null;
  return <p className="focus-tip" key={text}>{text}…</p>;
}

// The profile count climbs to its new value instead of jumping, with a "+n" for each batch.
function CountUp({ value }) {
  const [shown, setShown] = useState(value);
  const [bump, setBump] = useState(null);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (value === start) return undefined;
    from.current = value;
    if (value > start) setBump({ n: value - start, id: Date.now() });
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setShown(value); return undefined; }
    const t0 = performance.now();
    let frame;
    const step = (t) => {
      const k = Math.min(1, (t - t0) / 700);
      setShown(Math.round(start + (value - start) * (1 - (1 - k) ** 3)));
      if (k < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return (
    <span className="focus-num">
      <strong>{shown}</strong>
      {bump && <span className="focus-bump" key={bump.id} aria-hidden="true">+{bump.n}</span>}
    </span>
  );
}

function StepState({ state }) {
  return (
    <span className={`step-state ${state}`}>
      <span className="step-icon" aria-hidden="true">{state === "done" ? "✓" : ""}</span>
      {state}
    </span>
  );
}

function Details({ allSteps, steps, running, rows, blocked }) {
  return (
    <div className="focus-details" id="focus-details">
      <ol className="step-track" aria-label="Search steps">
        {allSteps.map((s) => {
          const status = steps[s.id]?.status ?? "pending";
          const state = !running && status === "running" ? "stopped" : status;
          return (
            <li key={s.id} className={state} aria-current={state === "running" ? "step" : undefined}>
              <StepState state={state} />
              <span className="step-label">{s.label}</span>
            </li>
          );
        })}
      </ol>
      <section className="live-sources" aria-label="Sources">
        <header className="live-head">
          <span className="eyebrow">Sources · {rows.length} checked{blocked ? ` · ${blocked} blocked` : ""}</span>
          <span className="eyebrow">Profiles</span>
        </header>
        <ul>
          {[...rows].reverse().map((r) => (
            <li key={`${r.key}-${r.order}`} className={r.state}>
              <span className="live-dot" aria-hidden="true" />
              <span className="live-name">{r.name}</span>
              <span className="live-detail">{r.detail}</span>
              <span className="live-count">{r.count ?? "–"}</span>
            </li>
          ))}
          {!rows.length && <li className="pending empty"><span className="live-dot" aria-hidden="true" />
            <span className="live-name">Waiting for the first source…</span></li>}
        </ul>
      </section>
    </div>
  );
}

// What a search under way shows: its phase, time, latest finds, profile count and the
// technical details. Also used where a replay
// only goes through some of the steps (phases without any are left out) and finds nothing new
// (`finds` false: no latest finds, no profile count).
export function ProgressBody({
  allSteps, steps, logs, running, result, startedAt, endedAt, who, error, usually = "usually 1 to 3 min",
  doneTitle = null, finds = true,
}) {
  const now = useNow(running);
  const [open, setOpen] = useState(false);
  if (!startedAt) return null;
  const seconds = Math.max(0, Math.round(((endedAt ?? now) - startedAt) / 1000));
  const found = profilesSoFar(logs);
  const rows = sourceRows(logs);
  const blocked = rows.filter((r) => r.state === "blocked").length;
  const parts = phases(allSteps, steps, running).filter((p) => p.size);
  const current = parts.findIndex((p) => p.state !== "done");
  const index = current < 0 ? parts.length - 1 : current;
  const latest = rows.filter((r) => r.count > 0).slice(-LATEST).reverse();

  let title;
  let status;
  if (running) {
    title = parts[index].title;
    status = `Step ${index + 1} of ${parts.length} · ${seconds} s · ${usually}`;
  } else if (result) {
    title = `${result.persons.length} people, ${result.profiles.length} profiles`;
    status = `Done in ${seconds} s`;
  } else if (doneTitle) {
    title = doneTitle;
    status = `Done in ${seconds} s`;
  } else {
    title = "The search stopped before the end";
    status = `Stopped after ${seconds} s`;
  }

  return (
    <>
      <main className="focus-main">
        <p className="focus-who">{who}</p>
        <h1 className="focus-title" aria-live="polite">{title}</h1>
        <p className={`focus-status ${running ? "running" : result || doneTitle ? "done" : "stopped"}`} role="status">
          {running && <span className="focus-live" aria-hidden="true" />}{status}</p>
        {running && <Tip phase={parts[index].label} seconds={seconds} />}
        {error && <p className="searching-error" role="alert">{error}</p>}

        <ol className="focus-phases" aria-label="Search progress">
          {parts.map((p) => (
            <li key={p.label} className={p.state} aria-current={p.state === "running" ? "step" : undefined}>
              <span className="focus-bar" aria-hidden="true"><span style={{ width: `${p.share * 100}%` }} /></span>
              <span className="focus-phase">{p.label}</span>
            </li>
          ))}
        </ol>

        {finds && <>
        <ul className="focus-latest" aria-label="Latest finds">
          {latest.map((r, i) => {
            const { label, code, detail } = describe(r);
            return (
              <li key={`${r.key}-${r.order}`} className={i === 0 ? "new" : ""} style={{ opacity: [1, 0.55, 0.25][i] }}>
                <span className="focus-code" aria-hidden="true">{code}</span>
                <span className="focus-name" title={label}>{label}</span>
                {detail && <span className="focus-detail" title={detail}>{detail}</span>}
              </li>
            );
          })}
        </ul>

        <p className="focus-count">
          <CountUp value={found} /> profile{found === 1 ? "" : "s"} found{running ? " so far" : ""}
        </p>
        {blocked > 0 && <p className="focus-note">{blocked} source{blocked === 1 ? "" : "s"} didn't answer. The results
          stay valid.</p>}
        </>}

        <button type="button" className="link-btn focus-toggle" aria-expanded={open} aria-controls="focus-details"
          onClick={() => setOpen((o) => !o)}>
          {open ? "Hide technical details" : "Technical details"}
        </button>
      </main>
      {open && <Details allSteps={allSteps} steps={steps} running={running} rows={rows} blocked={blocked} />}
    </>
  );
}

export default function Progress({
  allSteps, steps, logs, running, result, startedAt, endedAt, name, hints, error, onCancel, onBack, logo,
}) {
  if (!startedAt) return null;
  return (
    <div className="searching focus">
      <header className="searching-top">
        {logo}
        {running
          ? <button type="button" className="btn" onClick={onCancel}>Cancel search</button>
          : <button type="button" className="btn" onClick={onBack}>Back</button>}
      </header>
      <ProgressBody allSteps={allSteps} steps={steps} logs={logs} running={running} result={result}
        startedAt={startedAt} endedAt={endedAt} error={error} who={<>{name}{hints && <> · {hints}</>}</>} />
    </div>
  );
}
