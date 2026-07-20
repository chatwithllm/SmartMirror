/**
 * Bus topology (DESIGN.md §3). The Collector and Processor MUST use these
 * helpers — never hand-format a topic string elsewhere.
 */

export const TOPIC_ROOT = "hermes";

export const ingestTopic = (source: string): string => `${TOPIC_ROOT}/ingest/${source}`;
export const egressTopic = (channel: string): string => `${TOPIC_ROOT}/egress/${channel}`;
export const statusTopic = (source: string): string => `${TOPIC_ROOT}/status/${source}`;

export const INGEST_WILDCARD = `${TOPIC_ROOT}/ingest/+`;
export const EGRESS_WILDCARD = `${TOPIC_ROOT}/egress/+`;
export const DEADLETTER_TOPIC = `${TOPIC_ROOT}/deadletter`;

/** Postgres LISTEN/NOTIFY channel the web tail subscribes to. */
export const PG_NOTIFY_CHANNEL = "hermes_events";

/** Extract the trailing segment (source/channel) from a matched topic. */
export function topicTail(topic: string): string {
  const parts = topic.split("/");
  return parts[parts.length - 1] ?? "";
}
