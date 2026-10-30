import { exposedItems, exposureLevel } from "./exposure.jsx";

// Turns a SearchResult into Cytoscape elements: one compound node per person,
// its accounts inside, the searched name at the centre.
const PROVEN = new Set(["declared", "same_email", "same_avatar", "same_ssh_key", "same_phone", "archived", "same_url"]);
export const UNATTRIBUTED = "unattributed";
export const WEAK = "weak-hits";

export const MAX_MAIN = 7;

// The few main people shown on the graph (older saved searches: the 7 biggest).
export function mainPersons(result) {
  const core = result.persons.filter((p) => p.core);
  if (core.length) return core;
  return [...result.persons].sort((a, b) => b.profile_ids.length - a.profile_ids.length).slice(0, MAX_MAIN);
}

export function accountLabel(p) {
  if (p.extra?.tie) return `${p.extra.tie.label}\n${p.extra.tie.org}`;
  const page = p.platform === "Web page" || p.platform === "Data broker";
  const handle = (!page && (p.username || p.display_name)) || new URL(p.url).hostname;
  return `${p.platform}\n${handle}`;
}

const CODES = {
  "GitHub": "GH", "GitHub README": "GH", "GitLab": "GL", "LinkedIn": "IN", "Stack Overflow": "SO",
  "Bluesky": "BS", "Mastodon": "MA", "Hacker News": "HN", "Website": "WWW", "Web page": "WEB",
  "French company registry": "RCS", "ORCID": "ID", "Instagram": "IG", "X": "X", "Facebook": "FB",
  "TikTok": "TT", "YouTube": "YT", "Reddit": "RD", "Gravatar": "GV", "Goodreads": "GR",
  "PGP key": "PGP", "Email address": "@", "Data broker": "DB", "Archived page": "ARC",
  "News article": "NEW", "Document": "DOC", "Code mention": "COD", "Elected official (RNE)": "RNE",
  "HATVP declaration": "HV", "BODACC": "BO", "Wikidata": "WD", "OpenAlex": "OA", "PeerTube": "PT",
  "Annuaire de l'administration": "ADM", "Health professional (RPPS)": "RPS",
  "Lawyer (CNB directory)": "AV", "Organization role": "ORG",
  "Docker Hub": "DH", "Hugging Face": "HF", "Speaker Deck": "SD", "SoundCloud": "SC",
  "SlideShare": "SS", "Chess.com": "CH", "crates.io": "CR", "theses.fr": "TH",
  "Strava": "STR", "Polarsteps": "PS", "Komoot": "KMT", "Garmin Connect": "GAR", "AllTrails": "AT",
  "Relive": "RLV", "Wikiloc": "WL", "Runkeeper": "RK", "Sports Tracker": "STK", "Visorando": "VIS",
  "OpenRunner": "OR", "ZwiftPower": "ZP", "Couchsurfing": "CS",
  "Journal officiel (JORF)": "JO", "Athletics results (FFA)": "FFA", "Race results": "RUN",
};

// Short code drawn inside an account node: known platforms first, else initials.
export function platformCode(platform = "") {
  if (CODES[platform]) return CODES[platform];
  const words = platform.replace(/\(.*?\)/g, "").split(/[\s._-]+/).filter(Boolean);
  const code = words.length > 1 ? words.map((w) => w[0]).join("") : (words[0] || "?").slice(0, 2);
  return code.slice(0, 3).toUpperCase();
}

const PHOTO_FIRST = ["LinkedIn", "Instagram"];
const PLACEHOLDERS = ["missing.png", "/default", "default_profile", "d=mp", "avatar_default"];

// The person's profile photo: LinkedIn first, then Instagram, then any other account.
// A picture also shown by accounts of other people is a logo or a placeholder.
export function personPhoto(person, profiles) {
  const ids = new Set(person.profile_ids);
  const toCheck = new Set(person.to_check ?? []);
  const elsewhere = new Set(profiles.filter((p) => !ids.has(p.id)).map((p) => p.avatar_url));
  const rank = (p) => {
    const i = PHOTO_FIRST.indexOf(p.platform);
    return i < 0 ? PHOTO_FIRST.length : i;
  };
  const photos = profiles.filter((p) => ids.has(p.id) && !toCheck.has(p.id) && p.avatar_url
    && !elsewhere.has(p.avatar_url) && !PLACEHOLDERS.some((m) => p.avatar_url.includes(m)));
  return photos.sort((a, b) => rank(a) - rank(b))[0]?.avatar_url ?? null;
}

export function edgeClass(link) {
  if (link.kind === "same_username") return "lead";
  if (PROVEN.has(link.kind)) return "proven";
  return link.verified === false ? "inferred weak" : "inferred";
}

const SHARED = new Set(["Email", "Organization", "Location", "Website", "Username", "Job title"]);

// What a search around shows on its hub node while it runs, or once hidden.
function hubLabel(sub) {
  if (sub.status === "draft") return `${sub.name}\nHints to confirm`;
  if (sub.status === "queued") return `${sub.name}\nWaiting…`;
  if (sub.status === "running") return `${sub.name}\n${sub.phase ?? "Starting"} · ${sub.pct ?? 0}%`;
  if (sub.status === "error") return `${sub.name}\nSearch failed`;
  const name = sub.result?.name || sub.name;  // the full name a page proved for a first name alone
  if (sub.hidden) return `${name}\n${sub.result.profiles.length} profiles hidden`;
  return sub.result?.first_name_only ? `${name}\nTo check` : name;
}

// One search drawn on the graph: its main people under `root`, their accounts inside.
// `ns` keeps the ids of a search around apart; an account already drawn is not drawn twice,
// a "cross" edge ties it to the person of this search instead.
function addSearch(elements, shown, result, { ns = "", root, rootClass = "root", sub, showShared, showWeakLinks,
  loose = {} }) {
  const main = mainPersons(result);
  const tag = sub ? { sub } : {};
  const owner = {};
  for (const person of main) for (const id of person.profile_ids) owner[id] = ns + person.id;
  const toCheck = new Set(main.flatMap((p) => p.to_check ?? []));
  const high = (p) => exposureLevel(exposedItems(p, result.profiles)).key === "high";
  const exposed = new Set(main.filter(high).map((p) => ns + p.id));
  const single = new Set(main.filter((p) => p.profile_ids.length === 1).map((p) => ns + p.id));
  const push = (e) => { elements.push(e); shown.add(e.data.id); };

  for (const person of main) {
    const id = ns + person.id;
    const score = person.exposure_score ?? "?";
    const avatar = personPhoto(person, result.profiles);
    push({
      data: { id, label: person.label, kind: "person", score, ...tag,
        ...(ns ? { origId: person.id } : {}), ...(avatar ? { avatar } : {}) },
      classes: [exposed.has(id) ? "exposed" : "", sub ? "sub" : ""].join(" ").trim(),
    });
    push({ data: { id: `${root}->${id}`, source: root, target: id }, classes: rootClass });
  }
  if (loose.unattributed) push(loose.unattributed);
  if (loose.weak) push(loose.weak);
  for (const p of result.profiles) {
    const parent = owner[p.id] ?? loose.parentOf?.(p);
    if (!parent) continue;
    if (shown.has(p.id)) {
      if (ns && owner[p.id]) push({ data: { id: `${ns}x-${p.id}`, source: parent, target: p.id, ...tag },
        classes: "cross" });
      continue;
    }
    const label = accountLabel(p);
    const caption = single.has(parent) || parent === UNATTRIBUTED ? label.replace("\n", " · ") : p.platform;
    const base = p.extra?.weak && !owner[p.id] ? "weakhit" : parent === UNATTRIBUTED ? "orphan" : exposed.has(parent) ? "exposed" : "";
    const classes = toCheck.has(p.id) ? `${base} tocheck`.trim() : base;
    push({ data: { id: p.id, parent, label, caption, code: platformCode(p.platform), kind: "account", ...tag },
      classes });
  }
  if (showShared) {
    for (const person of main) {
      (person.facts || []).forEach((fact, i) => {
        const ids = fact.profile_ids.filter((id) => shown.has(id));
        if (!SHARED.has(fact.category) || ids.length < 2) return;
        const id = `${ns}fact-${person.id}-${i}`;
        push({ data: { id, parent: ns + person.id, label: fact.value, kind: "fact", fact, ...tag },
          classes: exposed.has(ns + person.id) ? "exposed" : "" });
        ids.forEach((pid) => push({ data: { id: `${id}-${pid}`, source: id, target: pid }, classes: "shared" }));
      });
    }
  }
  return { main, links: () => {
    const seen = new Set();
    result.links.forEach((link, i) => {
      if (!shown.has(link.source) || !shown.has(link.target) || link.source === link.target) return;
      if (!showWeakLinks && link.kind === "inferred" && link.verified === false) return;
      const key = [link.source, link.target].sort().join("|") + link.kind;
      if (seen.has(key) || shown.has(`${ns}link-${i}`)) return;
      seen.add(key);
      const pct = link.kind === "inferred" ? `${Math.round(link.confidence * 100)}%` : "";
      push({ data: { id: `${ns}link-${i}`, source: link.source, target: link.target, label: pct, link, ...tag },
        classes: edgeClass(link) });
    });
  } };
}

// `subs`: searches around (one level), each drawn from a hub node tied to the person it was found
// around. A hidden one keeps its hub only.
export function buildElements(
  result, { showUnattributed = false, showShared = false, showWeak = true, showAround = false,
    showWeakLinks = false } = {}, subs = [],
) {
  const elements = [{ data: { id: "search", label: result.name, kind: "search" } }];
  const shown = new Set(["search"]);
  const owned = new Set(mainPersons(result).flatMap((p) => p.profile_ids));
  const orphans = result.profiles.filter((p) => !owned.has(p.id) && !p.extra?.weak);
  const weak = result.profiles.filter((p) => !owned.has(p.id) && p.extra?.weak);
  const loose = {
    unattributed: showUnattributed && orphans.length ? { data: { id: UNATTRIBUTED,
      label: `Unattributed · ${orphans.length}`, kind: "person" }, classes: "unattributed" } : null,
    weak: showWeak && weak.length ? { data: { id: WEAK, label: `Unverified hits · ${weak.length}`, kind: "person" },
      classes: "weak" } : null,
    parentOf: (p) => (p.extra?.weak ? (showWeak ? WEAK : null) : (showUnattributed ? UNATTRIBUTED : null)),
  };
  const opts = { showShared, showWeakLinks };
  const { main, links } = addSearch(elements, shown, result, { root: "search", loose, ...opts });
  const persons = new Set(main.map((p) => p.id));

  const hubs = new Map(subs.map((sub) => [sub.key, `sub:${sub.key}`]));
  if (showAround) {
    for (const person of main) {
      (person.around || []).forEach((close, i) => {
        if (hubs.has(`${person.id}|${close.name}`)) return;  // drawn as the hub of its search
        const id = `around-${person.id}-${i}`;
        elements.push({ data: { id, label: close.name, kind: "close", close, personId: person.id,
          strength: close.strength } });
        elements.push({ data: { id: `${id}-edge`, source: person.id, target: id }, classes: "around" });
      });
    }
  }
  const later = [links];
  for (const sub of subs) {
    const hub = hubs.get(sub.key);
    const from = persons.has(sub.personId) ? sub.personId : "search";
    elements.push({ data: { id: hub, label: hubLabel(sub), kind: "hub", key: sub.key, status: sub.status },
      classes: [sub.status, sub.hidden ? "collapsed" : ""].join(" ").trim() });
    elements.push({ data: { id: `${hub}-edge`, source: from, target: hub, ...(sub.relation && { label: sub.relation }) },
      classes: `around hub-edge${sub.status === "running" ? " running" : ""}` });
    shown.add(hub);
    if (sub.status !== "done" || sub.hidden || !sub.result) continue;
    later.push(addSearch(elements, shown, sub.result, { ns: `${hub}/`, root: hub, rootClass: "root sub",
      sub: sub.key, ...opts }).links);
  }
  // Links last, once every account of every search is on the graph (links across searches too).
  later.forEach((add) => add());
  return elements;
}
