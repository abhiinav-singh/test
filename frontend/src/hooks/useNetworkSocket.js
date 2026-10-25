import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/ws`;
const RECONNECT_BASE_DELAY = 1000;
const MAX_RECONNECT_DELAY = 10000;
const MAX_EVENTS = 150;

/**
 * Assigns 3D positions to nodes in a rough spherical cluster layout.
 */
function assignPositions(nodes) {
  const count = nodes.length;
  const radius = 6;

  return nodes.map((node, i) => {
    // Use golden angle distribution for even spacing
    const phi = Math.acos(1 - (2 * (i + 0.5)) / count);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;

    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = (radius * 0.6) * Math.cos(phi); // Flattened vertically
    const z = radius * Math.sin(phi) * Math.sin(theta);

    return {
      ...node,
      position: [x, y, z],
      threatState: 'none', // 'none' | 'medium' | 'critical'
      threatTimestamp: null,
    };
  });
}

export function useNetworkSocket() {
  const [nodes, setNodes] = useState(new Map());
  const [connections, setConnections] = useState([]);
  const [events, setEvents] = useState([]);
  const [threatCount, setThreatCount] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimer = useRef(null);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
      console.log('[WebSentinel] WebSocket connected');
    };

    ws.onclose = () => {
      setIsConnected(false);
      console.log('[WebSentinel] WebSocket disconnected');

      // Exponential backoff reconnect
      const delay = Math.min(
        RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current),
        MAX_RECONNECT_DELAY
      );
      reconnectAttempts.current += 1;
      reconnectTimer.current = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error('[WebSentinel] WebSocket error', err);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleMessage(data);
      } catch (err) {
        console.error('[WebSentinel] Failed to parse message', err);
      }
    };
  }, []);

  const handleMessage = useCallback((data) => {
    // ── Initial topology ──────────────────────────────────────────
    if (data.type === 'topology') {
      const positioned = assignPositions(data.nodes);
      const nodeMap = new Map();
      positioned.forEach((n) => nodeMap.set(n.id, n));
      setNodes(nodeMap);
      setConnections(data.connections);
      return;
    }

    // ── Topology update (new node added, e.g., attacker) ──────────
    if (data.type === 'topology_update') {
      if (data.action === 'add_node') {
        setNodes((prev) => {
          const next = new Map(prev);
          if (!next.has(data.node.id)) {
            // Position the attacker node offset from the cluster
            const node = {
              ...data.node,
              position: [10, 2, 3], // Outside the main cluster
              threatState: 'critical',
              threatTimestamp: Date.now(),
            };
            next.set(data.node.id, node);
          }
          return next;
        });
        if (data.connection) {
          setConnections((prev) => [...prev, data.connection]);
        }
      }
      return;
    }

    // ── Network event ─────────────────────────────────────────────
    if (data.type === 'network_event') {
      // Update event log
      setEvents((prev) => {
        const next = [...prev, data];
        return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
      });

      // If threat detected, update node states
      if (data.threat) {
        const severity = data.severity || 'critical';

        setNodes((prev) => {
          const next = new Map(prev);

          // Mark source node as threat
          if (next.has(data.source_node)) {
            const sourceNode = { ...next.get(data.source_node) };
            sourceNode.threatState = severity;
            sourceNode.threatTimestamp = Date.now();
            next.set(data.source_node, sourceNode);
          }

          // Mark target node as threat (handles external/unknown attackers
          // whose source node is not in the node map)
          if (next.has(data.target_node)) {
            const targetNode = { ...next.get(data.target_node) };
            targetNode.threatState = severity;
            targetNode.threatTimestamp = Date.now();
            next.set(data.target_node, targetNode);
          }

          return next;
        });

        // Update threat-active connections
        setConnections((prev) => {
          return prev.map((conn) => {
            if (
              conn.source === data.source_node &&
              conn.target === data.target_node
            ) {
              return { ...conn, threat: true, severity };
            }
            return conn;
          });
        });

        setThreatCount((prev) => prev + 1);
      }
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  return {
    nodes,
    connections,
    events,
    threatCount,
    isConnected,
    nodeCount: nodes.size,
  };
}
