// Public demo: no backend. /api/search and the other calls are answered in the browser by
// replaying a recorded run of the offline demo (a fictional person, Jean Dupont).
import data from "./demo-data.json";

const delayOf = (event) => (event.type === "result" ? 400
  : event.type === "log" ? 140 : event.status === "running" ? 380 : 120);

class ReplaySource {
  constructor(url) {
    const params = new URL(url, window.location.href).searchParams;
    this.timers = [];
    this.closed = false;
    let events;
    if (params.get("key")) {
      const sub = data.subs[params.get("name")];
      events = sub ? sub.events : [{ type: "error", message: "Not part of the recorded demo." }];
    } else events = data.main.map((e) => e.event);
    let at = 200;
    for (const event of events) {
      at += delayOf(event);
      this.timers.push(setTimeout(() => {
        if (!this.closed) this.onmessage?.({ data: JSON.stringify(event) });
      }, at));
    }
  }
  close() { this.closed = true; this.timers.forEach(clearTimeout); }
}

const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body),
  { status, headers: { "Content-Type": "application/json" } }));
const realFetch = window.fetch.bind(window);

window.EventSource = ReplaySource;
window.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input.url;
  const path = new URL(url, window.location.href).pathname;
  if (!path.includes("/api/")) return realFetch(input, init);
  if (path.endsWith("/api/health")) return json({ status: "ok", steps: data.steps });
  return json({ detail: "Not available in the public demo." }, 404);
};
