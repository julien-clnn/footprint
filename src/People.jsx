import { byExposure, ExposureChips, exposedItems, exposureLevel } from "./exposure.jsx";
import { mainPersons, WEAK } from "./graph.js";

const SUBTITLE = ["Location", "Organization"];

export function rankedPeople(result) {
  return byExposure(mainPersons(result), result.profiles);
}

function subtitle(person) {
  const facts = SUBTITLE.map((c) => person.facts?.find((f) => f.category === c)?.value).filter(Boolean);
  const n = person.profile_ids.length;
  return [...facts, `${n} profile${n === 1 ? "" : "s"}`].join(" · ");
}

export default function People({ result, selectedId, onPick, others = 0 }) {
  const people = rankedPeople(result);
  return (
    <section className="people" aria-label="People ranked by exposure">
      <h2 className="eyebrow"><span>Main people · ranked by exposure</span><span>{people.length}</span></h2>
      <ol>
        {people.map((person) => {
          const items = exposedItems(person, result.profiles);
          const level = exposureLevel(items);
          return (
            <li key={person.id}>
              <button type="button" onClick={() => onPick(person.id)}
                className={`person-row level-${level.key}${selectedId === person.id ? " selected" : ""}`}
                aria-pressed={selectedId === person.id} title={level.label}>
                <span className="person-text">
                  <span className="person-name">{person.label}</span>
                  <span className="person-sub">{subtitle(person)}</span>
                </span>
                <ExposureChips items={items} />
              </button>
            </li>
          );
        })}
      </ol>
      {others > 0 && (
        <button type="button" className="loose" onClick={() => onPick(WEAK)}>
          + {others} other result{others === 1 ? "" : "s"} (other namesakes, pages to check)
        </button>
      )}
    </section>
  );
}
