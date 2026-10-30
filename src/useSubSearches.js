import { useCallback, useEffect, useRef, useState } from "react";
import { openSearch } from "./useSearch.js";

// Searches on people around a found person, run from the graph and drawn on the same graph.
// One level only; at most MAX_RUNNING at once (the others wait), to spare the sources.
export const MAX_RUNNING = 2;
export const subKey = (personId, name) => `${personId}|${name}`;
export const ACTIVE = new Set(["queued", "running"]);
// Someone known by a first name alone: their search starts from hints read where they were found.
export const isFirstName = (name) => /^[^\s@]+$/.test(name.trim());
export const FIELDS = [
  ["organization", "Organization"], ["website", "Website"], ["related", "Related person"], ["city", "City"]];
// "organization: Acme; related: Jane Doe; …": the backend reads these labels without the LLM.
export const hintsText = (fields, other = "") => [
  ...FIELDS.map(([k]) => fields[k]?.trim() && `${k}: ${fields[k].trim()}`), other.trim()].filter(Boolean).join("; ");

const fresh = (fields) => ({ status: "queued", steps: {}, logs: [], result: null, error: null, hidden: false,
  startedAt: null, endedAt: null, ...fields });

// The tie a search around starts from: the relation and its proof, kept for the graph and the hub card.
const tieOf = (result, personId, name) => {
  const close = result?.persons?.find((p) => p.id === personId)?.around?.find((c) => c.name === name);
  return close ? { relation: close.relation, evidence: close.evidence } : {};
};

// Saved searches keep their searches around (history entry → `subsearches`).
const fromSaved = (result) => Object.fromEntries(Object.entries(result?.subsearches ?? {}).map(([key, s]) => {
  const personId = key.split("|")[0];
  return [key, fresh({ key, name: s.name, hints: s.hints ?? "", personId, status: "done", result: s.result,
    ...tieOf(result, personId, s.name) })];
}));

export default function useSubSearches(result, demo) {
  const [subs, setSubs] = useState({});
  const sources = useRef(new Map());
  const current = useRef(subs);
  current.current = subs;
  const parent = result?.history_id ?? null;

  const patch = useCallback((key, fields) => setSubs((s) => (s[key]
    ? { ...s, [key]: { ...s[key], ...(typeof fields === "function" ? fields(s[key]) : fields) } } : s)), []);
  const close = useCallback((key) => { sources.current.get(key)?.close(); sources.current.delete(key); }, []);

  // A new main result: drop what was running for the previous one.
  useEffect(() => {
    sources.current.forEach((es) => es.close());
    sources.current.clear();
    setSubs(fromSaved(result));
  }, [result]);
  useEffect(() => () => sources.current.forEach((es) => es.close()), []);

  // Start waiting searches while there is room.
  useEffect(() => {
    const list = Object.values(subs);
    let free = MAX_RUNNING - list.filter((s) => s.status === "running").length;
    for (const sub of list) {
      if (free <= 0) break;
      if (sub.status !== "queued" || sources.current.has(sub.key)) continue;
      free -= 1;
      const { key } = sub;
      const end = (fields) => { close(key); patch(key, { ...fields, endedAt: Date.now() }); };
      sources.current.set(key, openSearch({
        name: sub.name, hints: sub.hints, key, ...(parent && { parent }), ...(demo && { demo: "true" }),
      }, {
        onStep: (event) => patch(key, (s) => ({ steps: { ...s.steps, [event.step]: event } })),
        onLog: (event) => patch(key, (s) => ({ logs: [...s.logs, event] })),
        onResult: (r) => end({ status: "done", result: r }),
        onError: (message) => end({ status: "error", error: message ?? "Connection to the API lost." }),
      }));
      patch(key, { status: "running", startedAt: Date.now() });
    }
  }, [subs, parent, demo, patch, close]);

  // A first name alone waits as a draft: its hints (read from the page that names them) are shown
  // pre-filled and editable, the search starts once confirmed.
  const request = useCallback((near, person) => {
    const key = subKey(person.id, near.name);
    const draft = isFirstName(near.name);
    const old = current.current[key];
    const created = !old || old.status === "error";
    setSubs((s) => {
      if (s[key] && s[key].status !== "error") {
        return { ...s, [key]: { ...s[key], hidden: false } };
      }
      const tie = { relation: near.relation, evidence: near.evidence };
      return { ...s, [key]: fresh({ key, name: near.name, hints: near.hint || "", personId: person.id, ...tie,
        ...(draft && { status: "draft", fields: {}, other: near.hint || "", loadingHints: Boolean(parent) }) }) };
    });
    if (draft && parent && created) {
      fetch(`/api/around/hints?${new URLSearchParams({ parent, person: person.id, name: near.name })}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((h) => patch(key, (s) => (s.status !== "draft" ? {} : {
          loadingHints: false, ...(h && { fields: h.fields, other: h.hints.split("; ").filter(
            (part) => !FIELDS.some(([k]) => part.startsWith(`${k}: `))).join("; ") }) })))
        .catch(() => patch(key, { loadingHints: false }));
    }
    return key;
  }, [parent, patch]);
  const start = useCallback((key, fields, other) => patch(key, (s) => (s.status !== "draft" ? {} : {
    status: "queued", fields, other, hints: hintsText(fields, other) })), [patch]);
  const retry = useCallback((key) => patch(key, (s) => fresh({ key, name: s.name, hints: s.hints,
    personId: s.personId, relation: s.relation, evidence: s.evidence })), [patch]);
  const toggle = useCallback((key) => patch(key, (s) => ({ hidden: !s.hidden })), [patch]);
  // Cancelling forgets the search (a finished one stays in the history).
  const cancel = useCallback((key) => {
    close(key);
    setSubs((s) => { const { [key]: _, ...rest } = s; return rest; });
  }, [close]);

  return { subs, request, start, cancel, retry, toggle };
}
