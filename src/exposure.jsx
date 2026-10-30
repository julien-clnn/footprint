// What a stranger can learn about a person, in plain words, most sensitive first. Built from the
// person's facts (and photo), so every chip points to something actually found.
import { personPhoto } from "./graph.js";

const KINDS = [
  { key: "address", label: "Address", weight: 5, categories: ["Address"] },
  { key: "phone", label: "Phone", weight: 5, categories: ["Phone"] },
  { key: "gps", label: "Photo location", weight: 4, categories: ["Photo GPS"] },
  { key: "breach", label: "Data breach", weight: 4, categories: ["Data breach"] },
  { key: "email", label: "Email", weight: 3, categories: ["Email"] },
  { key: "birth", label: "Birth date", weight: 3, categories: ["Birth month", "Birth date", "Birth year", "Birthplace"] },
  { key: "family", label: "Family", weight: 3, categories: ["Family"] },
  { key: "city", label: "City", weight: 2, categories: ["Location", "City", "Hometown", "Lives in"] },
  { key: "work", label: "Employer", weight: 2, categories: ["Organization", "Employer", "Job title"] },
  { key: "photo", label: "Photo", weight: 2 },
  { key: "school", label: "School", weight: 1, categories: ["School"] },
];

// Each item keeps the accounts it was found on (`ids`), to point at them on the graph.
export function exposedItems(person, profiles) {
  const facts = person.facts ?? [];
  const owned = new Set(person.profile_ids);
  return KINDS.map((kind) => {
    if (kind.key === "photo") {
      const photo = personPhoto(person, profiles);
      const ids = photo ? profiles.filter((p) => owned.has(p.id) && p.avatar_url === photo).map((p) => p.id) : [];
      return { ...kind, values: photo ? ["Profile photo"] : [], ids };
    }
    const found = facts.filter((f) => kind.categories.includes(f.category));
    return { ...kind, values: [...new Set(found.map((f) => f.value))],
      ids: [...new Set(found.flatMap((f) => f.profile_ids))] };
  }).filter((item) => item.values.length);
}

export const severity = (items) => items.reduce((sum, item) => sum + item.weight, 0);

// One word for the whole: "High" as soon as a home address or phone shows with other details.
export function exposureLevel(items) {
  const total = severity(items);
  if (total >= 12) return { key: "high", label: "High exposure" };
  if (total >= 6) return { key: "medium", label: "Medium exposure" };
  if (total > 0) return { key: "low", label: "Low exposure" };
  return { key: "minimal", label: "Minimal exposure" };
}

// Most exposed first; the old score only breaks ties.
export function byExposure(persons, profiles) {
  const weight = new Map(persons.map((p) => [p.id, severity(exposedItems(p, profiles))]));
  return [...persons].sort((a, b) => (weight.get(b.id) - weight.get(a.id))
    || ((b.exposure_score ?? -1) - (a.exposure_score ?? -1)));
}

const SENSITIVE = 4;

// With `onPick`, each chip is a button that shows on the graph where the detail was found.
export function ExposureChips({ items, max = 3, onPick, active }) {
  if (!items.length) return <span className="x-none">Nothing sensitive found</span>;
  const shown = items.slice(0, max);
  const rest = items.slice(max);
  return (
    <span className="x-chips">
      {shown.map((item) => {
        const className = `x-chip${item.weight >= SENSITIVE ? " hot" : ""}${active === item.key ? " active" : ""}`;
        const title = `${item.label}: ${item.values.slice(0, 3).join(" · ")}`;
        return onPick && item.ids.length ? (
          <button key={item.key} type="button" className={className} aria-pressed={active === item.key}
            title={`${title}. Show where it was found`} onClick={() => onPick(item)}>{item.label}</button>
        ) : <span key={item.key} className={className} title={title}>{item.label}</span>;
      })}
      {rest.length > 0 && <span className="x-chip more" title={rest.map((i) => i.label).join(", ")}>
        +{rest.length}</span>}
    </span>
  );
}
