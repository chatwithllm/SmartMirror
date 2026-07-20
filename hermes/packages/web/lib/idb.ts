"use client";
import type { EventRow } from "./db";

/**
 * IndexedDB cache of the last N events so the PWA renders instantly offline
 * (DESIGN §6). Keyed on `seq`. All calls are no-ops when IndexedDB is
 * unavailable (SSR / private mode) so callers never need to guard.
 */
const DB_NAME = "hermes";
const STORE = "events";
const CAP = 500;

function open(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "seq" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

export async function cacheEvents(events: EventRow[]): Promise<void> {
  const db = await open();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const e of events) store.put(e);
    tx.oncomplete = () => resolve();
    tx.onerror = () => resolve();
  });
  await trim(db);
  db.close();
}

async function trim(db: IDBDatabase): Promise<void> {
  await new Promise<void>((resolve) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const countReq = store.count();
    countReq.onsuccess = () => {
      const excess = countReq.result - CAP;
      if (excess <= 0) return resolve();
      // Delete the lowest-seq (oldest) entries.
      const cursorReq = store.openCursor();
      let removed = 0;
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && removed < excess) {
          cursor.delete();
          removed++;
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => resolve();
    };
    countReq.onerror = () => resolve();
  });
}

export async function loadCached(): Promise<EventRow[]> {
  const db = await open();
  if (!db) return [];
  const rows = await new Promise<EventRow[]>((resolve) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as EventRow[]) ?? []);
    req.onerror = () => resolve([]);
  });
  db.close();
  return rows.sort((a, b) => b.seq - a.seq);
}
