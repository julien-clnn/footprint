import Preview from "./Preview.jsx";

export default function Landing({ onDemo }) {
  return (
    <main className="landing">
      <div className="landing-copy">
        <p className="eyebrow accent">Personal exposure check</p>
        <h1>Which one is you,<br />and who just<br />shares your name?</h1>
        <p className="lede">
          Footprint reads 80+ public sources, separates you from your namesakes and shows how sure it
          is about every link.
        </p>
        <div className="actions">
          <button type="button" className="btn primary big" onClick={onDemo}>Try demo</button>
        </div>
        <p className="lede demo-note">
          Public demo: interface only, no backend. The search replays a recorded run on a fictional
          person, <b>Jean Dupont</b>.
        </p>
      </div>
      <Preview />
    </main>
  );
}
