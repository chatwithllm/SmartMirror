"use client";
import { useEffect, useRef, useState, useCallback, type FormEvent } from "react";
import type { EventRow } from "../lib/db";
import { mergeEvents, maxSeqOf } from "../lib/timeline";
import { cacheEvents, loadCached } from "../lib/idb";

type Conn = "connecting" | "live" | "offline";
const TOKEN_KEY = "hermes_device_token";

function shortId(id: string): string {
  return id.slice(0, 8);
}
function fmtTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function Timeline({ initial }: { initial: EventRow[] }) {
  const [events, setEvents] = useState<EventRow[]>(initial);
  const [conn, setConn] = useState<Conn>("connecting");
  const [token, setToken] = useState<string>("");
  const [cmd, setCmd] = useState("");
  const [sending, setSending] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const eventsRef = useRef<EventRow[]>(initial);
  eventsRef.current = events;

  const ingest = useCallback((rows: EventRow[]) => {
    if (rows.length === 0) return;
    setEvents((prev) => {
      const merged = mergeEvents(prev, rows);
      void cacheEvents(rows);
      return merged;
    });
  }, []);

  // Load token + hydrate from IndexedDB on mount.
  useEffect(() => {
    const t = typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null;
    if (t) setToken(t);
    void loadCached().then((cached) => {
      if (cached.length) setEvents((prev) => mergeEvents(prev, cached));
    });
  }, []);

  // Manage the SSE connection whenever the token or event set changes materially.
  useEffect(() => {
    if (!token) {
      setConn("offline");
      return;
    }
    let closed = false;
    setConn("connecting");
    const cursor = maxSeqOf(eventsRef.current);
    const url = `/api/stream?token=${encodeURIComponent(token)}&lastEventId=${cursor}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => !closed && setConn("live");
    es.addEventListener("event", (ev) => {
      try {
        ingest([JSON.parse((ev as MessageEvent).data) as EventRow]);
        setConn("live");
      } catch {
        /* ignore malformed frame */
      }
    });
    es.onerror = () => {
      if (!closed) setConn("offline"); // EventSource auto-reconnects with Last-Event-ID
    };

    return () => {
      closed = true;
      es.close(); // RULE 8 — always tear down the subscription
      esRef.current = null;
    };
    // Reconnect only on token change; the cursor is read from a ref so live
    // events update state without reopening the stream.
  }, [token, ingest]);

  const saveToken = (value: string): void => {
    const v = value.trim();
    setToken(v);
    if (typeof localStorage !== "undefined") {
      if (v) localStorage.setItem(TOKEN_KEY, v);
      else localStorage.removeItem(TOKEN_KEY);
    }
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const body = cmd.trim();
    if (!body || !token) return;
    setSending(true);
    try {
      const res = await fetch("/api/command", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ body }),
      });
      if (res.ok) setCmd("");
      else console.error("command failed", await res.text());
    } catch (err) {
      console.error("command error", err);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="wrap">
      <header className="top">
        <h1>Hermes</h1>
        <span className={`conn ${conn}`}>{conn === "live" ? "● live" : conn === "offline" ? "○ offline" : "… connecting"}</span>
      </header>

      {!token && (
        <div className="banner">
          Paste a device token to enable live updates &amp; commands:
          <input
            aria-label="device token"
            placeholder="device token"
            onKeyDown={(e) => {
              if (e.key === "Enter") saveToken((e.target as HTMLInputElement).value);
            }}
          />
        </div>
      )}

      <form className="cmd" onSubmit={submit}>
        <input
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="/status ha"
          aria-label="command"
        />
        <button type="submit" disabled={sending || !token || !cmd.trim()}>
          Send
        </button>
      </form>

      <ul className="timeline">
        {events.map((e) => (
          <li key={e.seq} className={`row actor-${e.actor} sev-${e.severity}`}>
            <span className="time">{fmtTime(e.ts)}</span>
            <div>
              <div className="body">
                <span className="dot">●</span> {e.body}
              </div>
              <div className="meta">
                <span className="tag">{e.source}</span>
                <span className="tag">{e.kind}</span>
                <span className="tag">{e.actor}</span>
                {e.correlation_id && <span className="tag">⛓ incident {shortId(e.correlation_id)}</span>}
                {e.entities.map((ent) => (
                  <span key={ent} className="tag">
                    {ent}
                  </span>
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
