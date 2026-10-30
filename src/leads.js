import { mainPersons } from "./graph.js";

// Results that are not attached to a person: unverified search hits (extra.weak) and
// unattributed accounts. Ranks them by how likely they are to be the searched person
// and finds the person they share a detail with (city, employer, username, domain...).


const CATEGORIES = [
  ["Code & tech", /github|gitlab|codeberg|stack overflow|hacker news|docker|hugging|crates|pgp|code mention|keybase|^dev$/i],
  ["Work & research", /linkedin|malt|viadeo|meetup|eventbrite|doctolib|sant[ée]|lawyer|architect|accountant|researchgate|academia|orcid|hal$|theses|openalex/i],
  ["Public records & news", /registry|bodacc|elected|hatvp|journal officiel|data broker|news|document|archived|wikidata|federation|race results|athletics/i],
  ["Media & creative", /youtube|vimeo|dailymotion|twitch|soundcloud|spotify|behance|dribbble|flickr|deviantart|artstation|unsplash|medium|substack|wordpress|slideshare|speaker deck|calameo|peertube|ko-fi|patreon|tipeee|ulule|goodreads/i],
  ["Web pages", /^web page$|^website$/i],
  ["Sport & travel", /strava|polarsteps|komoot|garmin|alltrails|relive|wikiloc|runkeeper|sports tracker|visorando|openrunner|zwift|couchsurfing/i],
  ["Social", /^x$|instagram|facebook|tiktok|bluesky|mastodon|threads|reddit|tumblr|pinterest|linktree|copains|letterboxd|vinted|trustpilot|quora|wattpad|steam/i],
];

export function siteCategory(platform = "") {
  return CATEGORIES.find(([, re]) => re.test(platform))?.[0] ?? "Other";
}

// Lowercase, no accents, words separated by single spaces: "Lyon-3ᵉ" -> "lyon 3e".
export function norm(text = "") {
  return String(text).normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

const has = (haystack, needle) => needle.length >= 3 && ` ${haystack} `.includes(` ${needle} `);
const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; } };
const firstPart = (value) => String(value).split(",")[0];

function leadText(p) {
  const x = p.extra ?? {};
  return norm([p.display_name, p.username, p.bio, p.location, p.organization, x.search_title,
    p.url, ...(p.emails ?? []), ...(p.websites ?? [])].filter(Boolean).join(" "));
}

const HINTS = [
  ["usernames", "username", 5], ["emails", "email", 5], ["websites", "website", 4],
  ["organizations", "employer", 3], ["occupations", "job", 2], ["locations", "city", 2],
];

// Free-text hints the parser did not sort ("Lyon" when the LLM is down), split on commas.
function rawHints(hints) {
  const known = new Set(HINTS.flatMap(([key]) => hints[key] ?? []).map(norm));
  return String(hints.raw ?? "").split(/[,;\n]+/).map((v) => v.trim())
    .filter((v) => norm(v).length >= 3 && !known.has(norm(v)));
}

function hintMatches(text, hints = {}) {
  const found = rawHints(hints).filter((v) => has(text, norm(v))).map((value) => ({ kind: "hint", value, weight: 2 }));
  for (const [key, kind, weight] of HINTS) {
    for (const value of hints[key] ?? []) {
      const needle = norm(key === "locations" ? firstPart(value) : key === "websites" ? host(value) || value : value);
      if (has(text, needle)) found.push({ kind, value: key === "locations" ? firstPart(value).trim() : value, weight });
    }
  }
  return found;
}

function nameIn(name, text) {
  const words = norm(name).split(" ").filter(Boolean);
  return words.length > 0 && words.every((w) => ` ${text} `.includes(` ${w} `));
}

// Detail of a person that a lead can share: [fact category, label, weight].
const SHARED = {
  Username: ["username", 5], Email: ["email", 5], Phone: ["phone", 5], Website: ["domain", 4],
  Organization: ["employer", 3], "Job title": ["job", 2], School: ["school", 2], Location: ["city", 1],
};

const compact = (v) => norm(v).replace(/ /g, "");

// A detail made only of the searched name ("julien.martin", "Martin") says nothing.
function nameOnly(value, nameWords) {
  const words = norm(value).split(" ");
  const joined = compact(value);
  return words.every((w) => nameWords.includes(w)) || joined === nameWords.join("")
    || joined === [...nameWords].reverse().join("");
}

function personDetails(person, nameWords) {
  const out = [];
  for (const f of person.facts ?? []) {
    const rule = SHARED[f.category];
    if (!rule) continue;
    const value = f.category === "Location" ? firstPart(f.value).trim() : f.value;
    const needle = norm(value);
    if (needle.length >= 3 && !nameOnly(value, nameWords)) {
      out.push({ kind: rule[0], weight: rule[1], value, needle, raw: String(value).toLowerCase() });
    }
  }
  return out;
}

// Usernames and emails must appear as written (or as the same handle), not as loose words.
function shares(d, text, p, raw, h) {
  if (d.kind === "username") return compact(p.username ?? "") === compact(d.value) || raw.includes(d.raw);
  if (d.kind === "email") return raw.includes(d.raw);
  if (d.kind === "domain") return h === d.value || raw.includes(d.raw);
  return has(text, d.needle);
}

function nearest(text, p, persons) {
  const h = host(p.url);
  const raw = [p.url, p.username, p.bio, p.extra?.search_title, ...(p.emails ?? []), ...(p.websites ?? [])]
    .filter(Boolean).join(" ").toLowerCase();
  const found = [];
  for (const person of persons) {
    const shared = person.details.filter((d) => shares(d, text, p, raw, h));
    if (!shared.length) continue;
    const detail = shared.reduce((a, b) => (b.weight > a.weight ? b : a));
    found.push({ personId: person.id, label: person.label, score: person.score, detail, shared,
      weight: detail.weight * 10 + shared.length });
  }
  if (!found.length) return null;
  found.sort((a, b) => b.weight - a.weight || b.score - a.score);
  return { ...found[0], others: found.filter((f) => f.weight === found[0].weight).length - 1 };
}

const REASON = { username: "Same username", email: "Same email", phone: "Same phone", domain: "Same domain",
  employer: "Same employer", job: "Same job", school: "Same school", city: "Same city" };
export const reasonText = (detail) => `${REASON[detail.kind] ?? "Same detail"}: ${detail.value}`;

// What the URL alone says: "@jane.doe", "@jane.doe · post", "reel", "acme · company"...
const KINDS = { p: "post", tv: "video", reel: "reel", reels: "reel", status: "post", video: "video", watch: "video",
  shorts: "short", posts: "post", pulse: "article", photo: "photo", photos: "photo", events: "event",
  groups: "group", company: "company", showcase: "company", school: "school", channel: "channel", playlist: "playlist",
  books: "document", read: "document", pin: "pin" };
const NAMED_KINDS = new Set(["group", "company", "school", "channel"]);
const HANDLE_PREFIX = new Set(["in", "user", "c", "u", "profile", "people", "pub", "stories"]);
const HANDLE = /^@?[\p{L}\p{N}._-]{2,40}$/u;

export function urlBits(url) {
  let parts;
  try { parts = new URL(url); } catch { return { handle: null, kind: null, label: "" }; }
  const segs = parts.pathname.split("/").filter(Boolean)
    .map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  const [first = "", second] = segs;
  const low = first.toLowerCase();
  let handle = null;
  let kind = null;
  if (KINDS[low]) {
    kind = KINDS[low];
    if (NAMED_KINDS.has(kind) && second) handle = second;
  } else if (HANDLE_PREFIX.has(low) && second) {
    handle = second;
    if (low === "stories") kind = "story";
  } else if (HANDLE.test(first) && !/\.php$/i.test(first)) {
    handle = first.replace(/^@/, "");
    kind = segs.slice(1).map((s) => KINDS[s.toLowerCase()]).find(Boolean) ?? (segs.length > 1 ? "page" : null);
  } else if (segs.length) kind = "page";
  const at = handle && (NAMED_KINDS.has(kind) ? handle : `@${handle}`);
  return { handle: handle && handle.toLowerCase(), kind, label: [at, kind].filter(Boolean).join(" · ") };
}

// Same page whatever the scheme, "www.", trailing slash, tracking query or fragment.
export function normUrl(url) {
  try {
    const u = new URL(url);
    const v = u.hostname.endsWith("youtube.com") && u.searchParams.get("v");
    return `${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}`.toLowerCase() + (v ? `?v=${v}` : "");
  } catch { return String(url).toLowerCase(); }
}

const siteWords = (v) => norm(v).replace(/\b(link to|www|com|fr|org|net|login|log in|sign up)\b/g, "").replace(/ /g, "");

// A search title that only names the site ("Instagram", "Link to instagram.com") says nothing.
export function usefulTitle(p) {
  const t = p.extra?.search_title ?? "";
  const bare = siteWords(t);
  return bare.length < 2 || bare === siteWords(p.platform) || bare === siteWords(host(p.url)) ? "" : t;
}

// Why a result is in the list, in a few words: the pivot or query that found it, the page linking to it.
export function origin(p) {
  const x = p.extra ?? {};
  if (x.pivot) return `search for “${x.pivot}”`;
  const linked = /^linked from (\S+)/.exec(x.match ?? "");
  if (linked) return `linked from ${host(linked[1]) || linked[1]}`;
  if (x.query) return `query ${x.query}`;
  return "";
}

// A weak hit with nothing of its own to show: no name, no text, no hint, no shared detail.
function bare(lead) {
  const p = lead.profile;
  return lead.weak && !lead.named && !lead.hints.length && !lead.near && !p.extra?.pivot
    && !usefulTitle(p) && !(p.bio ?? "").trim();
}

// Rows to draw: specific leads one by one; bare ones, and weak hits repeating a row already shown
// (same handle, same text), folded per platform at the end (a group of one stays a plain row).
export function leadRows(leads) {
  const rows = [];
  const groups = new Map();
  const seen = new Set();
  for (const lead of leads) {
    const p = lead.profile;
    const handle = urlBits(p.url).handle;
    const key = handle && [host(p.url), handle, usefulTitle(p), p.bio ?? ""].join("|");
    if (bare(lead) || (lead.weak && !lead.named && seen.has(key))) {
      if (!groups.has(p.platform)) groups.set(p.platform, { platform: p.platform, leads: [] });
      groups.get(p.platform).leads.push(lead);
    } else rows.push({ lead });
    if (key) seen.add(key);
  }
  const folded = [...groups.values()].sort((a, b) => b.leads.length - a.leads.length);
  return [...rows, ...folded.map((g) => (g.leads.length === 1 ? { lead: g.leads[0] } : { group: g }))];
}

// One lead per page: the same URL found twice (search hit and linked account) keeps the best one.
function dedupe(leads) {
  const best = new Map();
  for (const lead of leads) {
    const key = normUrl(lead.profile.url);
    const prev = best.get(key);
    if (!prev || lead.score > prev.score) best.set(key, lead);
  }
  return [...best.values()];
}

export function computeLeads(result, { showWeak = true, showUnattributed = true } = {}) {
  const main = mainPersons(result);
  const owned = new Set(main.flatMap((p) => p.profile_ids));
  const persons = main.map((p) => ({ id: p.id, label: p.label, score: p.exposure_score ?? 0,
    details: personDetails(p, norm(result.name).split(" ")) }));
  const leads = [];
  for (const p of result.profiles) {
    if (owned.has(p.id)) continue;
    const weak = Boolean(p.extra?.weak);
    if (weak ? !showWeak : !showUnattributed) continue;
    const text = leadText(p);
    const hints = hintMatches(text, result.hints);
    const named = weak ? String(p.extra?.match ?? "").startsWith("name") || nameIn(result.name, text)
      : nameIn(result.name, text) || p.found_via === "name_search";
    const near = nearest(text, p, persons);
    const score = hints.reduce((s, m) => s + m.weight, 0) * 10 + (near?.detail.weight ?? 0) * 3
      + (named ? 4 : 0) + (weak ? 0 : 2);
    leads.push({ profile: p, weak, hints, named, near, score, category: siteCategory(p.platform) });
  }
  return dedupe(leads).sort((a, b) => b.score - a.score);
}

export function why(lead, name) {
  const lines = lead.hints.map((m) => `Mentions your hint "${m.value}" (${m.kind})`);
  const x = lead.profile.extra ?? {};
  const linked = /^linked from (\S+)/.exec(x.match ?? "");
  if (lead.weak && lead.named) lines.push(`Search result that names ${name}`);
  else if (lead.weak && x.pivot) lines.push(`Shows “${x.pivot}”, searched on its own, without the name`);
  else if (lead.weak && linked) lines.push(`Linked from ${host(linked[1]) || linked[1]}, a page that names ${name}`);
  else if (lead.weak) lines.push("Returned by the search engine, without the name");
  else lines.push("Account found for the name, not tied to any person");
  if (lead.near) lines.push(`${reasonText(lead.near.detail)} as ${lead.near.label}`
    + (lead.near.others ? ` (and ${lead.near.others} other ${lead.near.others === 1 ? "person" : "people"})` : ""));
  return lines;
}
