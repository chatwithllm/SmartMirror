import Timeline from "./Timeline";
import { recentEvents, type EventRow } from "../lib/db";
import { SwRegister } from "./sw-register";

export const dynamic = "force-dynamic";

/**
 * Server-rendered initial timeline (last N, newest-first). The page sits behind
 * the authenticating proxy, so SSR reads the DB directly; the client then opens
 * the device-token-gated SSE stream for the live tail.
 */
export default async function Page() {
  let initial: EventRow[] = [];
  try {
    initial = await recentEvents(100);
  } catch (err) {
    console.error("[page] initial load failed:", err);
  }
  return (
    <>
      <SwRegister />
      <Timeline initial={initial} />
    </>
  );
}
