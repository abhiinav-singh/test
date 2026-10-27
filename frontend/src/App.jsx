import { useState, useEffect } from 'react';
import NetworkGraph from './scene/NetworkGraph';
import StatusBar from './components/StatusBar';
import EventLog from './components/EventLog';
import ThreatTimeline from './components/ThreatTimeline';
import ScanlineOverlay from './components/ScanlineOverlay';
import { useNetworkSocket } from './hooks/useNetworkSocket';
import { useThreatTimeline } from './hooks/useThreatTimeline';

/**
 * WebSentinel — Root Application
 *
 * Layout: CSS Grid
 * - Top: StatusBar (full width, 44px)
 * - Left (~65%): 3D NetworkGraph canvas
 * - Right (~35%): Terminal EventLog
 */
export default function App() {
  const { nodes, connections, events, totalEvents, threatCount, isConnected, nodeCount } =
    useNetworkSocket();

  // Aggregate threat events into time buckets for the timeline
  const { buckets } = useThreatTimeline(events);

  // Detect prefers-reduced-motion
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const handler = (e) => setReducedMotion(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return (
    <>
      <div className="app-layout">
        {/* Status Bar */}
        <div className="app-layout__status-bar">
          <StatusBar
            nodeCount={nodeCount}
            threatCount={threatCount}
            isConnected={isConnected}
          />
        </div>

        {/* 3D Scene */}
        <div className="app-layout__scene" id="network-graph">
          <NetworkGraph
            nodes={nodes}
            connections={connections}
            reducedMotion={reducedMotion}
          />
        </div>

        {/* Event Log */}
        <div className="app-layout__log">
          <EventLog events={events} totalEvents={totalEvents} />
        </div>

        {/* Threat Timeline */}
        <div className="app-layout__timeline">
          <ThreatTimeline buckets={buckets} />
        </div>
      </div>

      {/* Scanline overlay on top of everything */}
      <ScanlineOverlay />
    </>
  );
}
