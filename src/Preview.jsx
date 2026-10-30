import "./preview.css";

const ACCOUNTS = [
  ["gh", "GH", 142, 245], ["www", "WWW", 90, 270], ["so", "SO", 194, 270], ["in", "IN", 78, 325],
  ["bs", "BS", 206, 325], ["hn", "HN", 113, 370], ["ma", "MA", 170, 370],
];
const AT = Object.fromEntries(ACCOUNTS.map(([id, , x, y]) => [id, [x + 12, y + 12]]));
const LINKS = [
  ["gh", "bs", "proven"], ["gh", "www", "proven"], ["bs", "ma", "proven"], ["www", "in", "inferred"],
  ["gh", "hn", "lead"], ["gh", "ma", "lead"], ["gh", "so", "weak"],
];
const FACTS = [[46, 228, "gh"], [24, 332, "in"], [126, 423, "hn"]];
const NAMESAKES = [[332, 163, "33/100", "RCS"], [387, 288, "23/100", "GH"], [332, 412, "13/100", "ID"]];
const PILL = [280, 311];

// Decorative, static sketch of the demo graph for the landing page.
export default function Preview() {
  let i = 0;
  const delay = () => ({ "--d": `${0.15 + 0.07 * i++}s` });
  return (
    <div className="landing-preview" aria-hidden="true">
      <svg className="preview-svg" viewBox="0 110 520 390" role="presentation" focusable="false">
        <g className="pv-namesakes">
          {NAMESAKES.map(([x, y, score, chip]) => (
            <g key={score}>
              <line className="pv-link pv-trunk" x1={PILL[0]} y1={PILL[1]} x2={x + (y === 288 ? 0 : 30)}
                y2={y + 30} style={delay()} />
            </g>
          ))}
          {NAMESAKES.map(([x, y, score, chip]) => (
            <g key={chip} className="pv-float" style={delay()}>
              <text className="pv-label" x={x + 58} y={y - 8} textAnchor="middle">Jean Dupont, {score}</text>
              <rect className="pv-card" x={x} y={y} width="116" height="60" rx="10" />
              <rect className="pv-chip" x={x + 46} y={y + 18} width="24" height="24" rx="5" />
              <text className="pv-tag muted" x={x + 58} y={y + 33} textAnchor="middle">{chip}</text>
            </g>
          ))}
        </g>

        <line className="pv-link pv-trunk" x1="143" y1="311" x2={PILL[0]} y2={PILL[1]} style={delay()} />
        <g className="pv-person">
          <text className="pv-label strong" x="142" y="200" textAnchor="middle">
            Jean Dupont, <tspan className="pv-score">88/100</tspan>
          </text>
          <rect className="pv-box" x="40" y="208" width="205" height="204" rx="12" />
          {LINKS.map(([a, b, kind]) => (
            <line key={a + b} className={`pv-link ${kind}`} x1={AT[a][0]} y1={AT[a][1]} x2={AT[b][0]} y2={AT[b][1]}
              style={delay()} />
          ))}
          {FACTS.map(([x, y, to]) => (
            <g key={to} className="pv-fade" style={delay()}>
              <line className="pv-link fact" x1={x} y1={y} x2={AT[to][0]} y2={AT[to][1]} />
              <rect className="pv-fact" x={x - 4} y={y - 4} width="8" height="8" rx="2.5" />
            </g>
          ))}
          {ACCOUNTS.map(([id, label, x, y]) => (
            <g key={id} className="pv-pop" style={delay()}>
              <rect className="pv-account" x={x} y={y} width="24" height="24" rx="5" />
              <text className="pv-tag" x={x + 12} y={y + 15} textAnchor="middle">{label}</text>
            </g>
          ))}
        </g>

        <g className="pv-orphan pv-fade" style={delay()}>
          <circle className="pv-unknown" cx="290" cy="146" r="9" />
          <text className="pv-tag muted" x="290" y="149" textAnchor="middle">ID</text>
        </g>

        <g className="pv-pill">
          <rect x={PILL[0] - 47} y={PILL[1] - 12} width="94" height="24" rx="12" />
          <text x={PILL[0]} y={PILL[1] + 4} textAnchor="middle">Jean Dupont</text>
        </g>
      </svg>
      <p className="preview-caption">Preview · demo graph, 4 people</p>
    </div>
  );
}
