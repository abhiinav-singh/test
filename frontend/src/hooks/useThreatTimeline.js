import { useState, useEffect, useRef, useCallback } from 'react';

const BUCKET_SIZE_MS = 10_000; // 10-second buckets
const WINDOW_MS = 10 * 60 * 1000; // 10-minute rolling window
const MAX_BUCKETS = WINDOW_MS / BUCKET_SIZE_MS; // 60 buckets

/**
 * Aggregates threat events into time buckets for the timeline chart.
 * Subscribes to the same events array from useNetworkSocket.
 *
 * Each bucket: { timestamp, count, maxSeverity, nodes: Set }
 */
export function useThreatTimeline(events) {
  const [buckets, setBuckets] = useState([]);
  const processedCount = useRef(0);
  const bucketsRef = useRef([]);

  // Process new events as they arrive
  useEffect(() => {
    if (events.length <= processedCount.current) return;

    const newEvents = events.slice(processedCount.current);
    processedCount.current = events.length;

    let updated = false;

    for (const event of newEvents) {
      if (!event.threat) continue;
      updated = true;

      const eventTime = event.timestamp
        ? new Date(event.timestamp).getTime()
        : Date.now();

      // Find or create bucket
      const bucketKey = Math.floor(eventTime / BUCKET_SIZE_MS) * BUCKET_SIZE_MS;
      let bucket = bucketsRef.current.find((b) => b.timestamp === bucketKey);

      if (!bucket) {
        bucket = {
          timestamp: bucketKey,
          count: 0,
          maxSeverity: 'none',
          nodes: new Set(),
        };
        bucketsRef.current.push(bucket);
        // Keep sorted by timestamp
        bucketsRef.current.sort((a, b) => a.timestamp - b.timestamp);
      }

      bucket.count += 1;

      // Track highest severity
      const severityRank = { none: 0, medium: 1, critical: 2 };
      const eventSeverity = event.severity || 'critical';
      if ((severityRank[eventSeverity] || 0) > (severityRank[bucket.maxSeverity] || 0)) {
        bucket.maxSeverity = eventSeverity;
      }

      // Track affected node names
      if (event.source_hostname) bucket.nodes.add(event.source_hostname);
      if (event.target_hostname) bucket.nodes.add(event.target_hostname);
    }

    if (updated) {
      // Prune buckets outside the rolling window
      const cutoff = Date.now() - WINDOW_MS;
      bucketsRef.current = bucketsRef.current.filter((b) => b.timestamp >= cutoff);

      // Trigger re-render with a shallow copy
      setBuckets(
        bucketsRef.current.map((b) => ({
          ...b,
          nodes: Array.from(b.nodes),
        }))
      );
    }
  }, [events]);

  // Periodic pruning of old buckets (every 10s)
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - WINDOW_MS;
      const before = bucketsRef.current.length;
      bucketsRef.current = bucketsRef.current.filter((b) => b.timestamp >= cutoff);

      if (bucketsRef.current.length !== before) {
        setBuckets(
          bucketsRef.current.map((b) => ({
            ...b,
            nodes: Array.from(b.nodes),
          }))
        );
      }
    }, BUCKET_SIZE_MS);

    return () => clearInterval(interval);
  }, []);

  return { buckets, bucketSizeMs: BUCKET_SIZE_MS, windowMs: WINDOW_MS };
}
