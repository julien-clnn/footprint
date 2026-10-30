import { useCallback, useRef, useState } from "react";

// Opens /api/search (SSE) and hands each event to its handler; returns the EventSource.
export function openSearch(params, { onStep, onLog, onResult, onError }) {
  const es = new EventSource(`/api/search?${new URLSearchParams(params)}`);
  es.onmessage = (message) => {
    const event = JSON.parse(message.data);
    if (event.type === "step") onStep(event);
    else if (event.type === "log") onLog(event);
    else if (event.type === "result") { es.close(); onResult(event.result); }
    else if (event.type === "error") { es.close(); onError(event.message); }
  };
  es.onerror = () => { es.close(); onError(null); };
  return es;
}

// Streams /api/search (SSE) and keeps the step statuses, logs and final result.
export default function useSearch() {
  const [steps, setSteps] = useState({});
  const [logs, setLogs] = useState([]);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState(null);
  const [endedAt, setEndedAt] = useState(null);
  const source = useRef(null);

  const start = useCallback((name, hints, demo = false) => {
    source.current?.close();
    setSteps({});
    setLogs([]);
    setResult(null);
    setError(null);
    setRunning(true);
    setStartedAt(Date.now());
    setEndedAt(null);
    const stop = () => { setRunning(false); setEndedAt(Date.now()); };
    source.current = openSearch({ name, hints, ...(demo && { demo: "true" }) }, {
      onStep: (event) => setSteps((s) => ({ ...s, [event.step]: event })),
      onLog: (event) => setLogs((l) => [...l, event]),
      onResult: (r) => { setResult(r); stop(); },
      onError: (message) => { setError((e) => message ?? e ?? "Connection to the API lost."); stop(); },
    });
  }, []);

  const cancel = useCallback(() => {
    source.current?.close();
    setRunning(false);
    setEndedAt(Date.now());
  }, []);

  const load = useCallback((saved) => {
    source.current?.close();
    setSteps({});
    setLogs([]);
    setError(null);
    setRunning(false);
    setResult(saved);
    setStartedAt(null);
    setEndedAt(null);
  }, []);

  return { start, cancel, load, steps, logs, result, error, running, startedAt, endedAt };
}
