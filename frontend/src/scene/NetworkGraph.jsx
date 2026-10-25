import { useState, useCallback, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import NetworkNode from './NetworkNode';
import NodeLabel from './NodeLabel';
import ConnectionLine from './ConnectionLine';
import ShockwaveRing from './ShockwaveRing';
import AmbientParticles from './AmbientParticles';

const PULSE_INTERVAL = 1.2; // seconds between ring bursts per threatened node

/**
 * Frame-accurate pulse controller.
 * Lives inside the Canvas to use R3F's useFrame — the same timing mechanism
 * as ShockwaveRingLayer — so it is immune to React re-render / StrictMode
 * double-invoke / stale-closure issues that make setInterval unreliable here.
 *
 * Algorithm: per-node elapsed-seconds counter in a Map ref.
 * Initialising a newly-threatened node at PULSE_INTERVAL causes the very
 * first frame to exceed the threshold and spawn immediately; subsequent
 * rings spawn every PULSE_INTERVAL seconds for as long as the node stays
 * in a threat state. Recovering nodes have their timer deleted so the
 * next threat transition always starts fresh.
 */
function PulseController({ nodes, reducedMotion, onSpawn }) {
  const timers = useRef(new Map()); // nodeId → seconds since last spawn

  useFrame((_, delta) => {
    if (reducedMotion) return;

    nodes.forEach((node, nodeId) => {
      const isThreat =
        node.threatState === 'critical' || node.threatState === 'medium';

      if (isThreat) {
        // New threat node: initialise at PULSE_INTERVAL so first frame spawns immediately
        const elapsed = timers.current.has(nodeId)
          ? timers.current.get(nodeId) + delta
          : PULSE_INTERVAL;

        if (elapsed >= PULSE_INTERVAL) {
          onSpawn(node);
          timers.current.set(nodeId, 0);
        } else {
          timers.current.set(nodeId, elapsed);
        }
      } else if (timers.current.has(nodeId)) {
        timers.current.delete(nodeId); // node recovered — reset for next transition
      }
    });
  });

  return null;
}

/**
 * Root 3D scene: the network graph visualization.
 * Contains all nodes, connections, effects, lighting, and atmosphere.
 */
export default function NetworkGraph({
  nodes,
  connections,
  reducedMotion = false,
}) {
  const [shockwaves, setShockwaves] = useState([]);

  const nodesArray = useMemo(() => Array.from(nodes.values()), [nodes]);

  // Threat-state → ring color (mirrors NetworkNode's palette exactly)
  const threatColor = useCallback((state) => {
    if (state === 'critical') return '#FF3B30';
    if (state === 'medium')   return '#D9A441';
    return '#39FF88';
  }, []);

  // Push a single burst entry into the shockwaves list
  const spawnRing = useCallback((node) => {
    const nodeRadius =
      node.type === 'router' ? 0.35 : node.type === 'external' ? 0.4 : 0.25;
    const id = `${node.id}-${Date.now()}-${Math.random()}`;
    setShockwaves((prev) => [
      ...prev,
      {
        id,
        position: [...node.position],
        color: threatColor(node.threatState),
        nodeRadius,
      },
    ]);
  }, [threatColor]);

  const removeShockwave = useCallback((id) => {
    setShockwaves((prev) => prev.filter((sw) => sw.id !== id));
  }, []);

  return (
    <Canvas
      camera={{ position: [0, 8, 14], fov: 50, near: 0.1, far: 100 }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => {
        gl.setClearColor('#0A0E0F');
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.2;
      }}
    >
      {/* ── Lighting ───────────────────────────────────────────── */}
      <ambientLight intensity={0.15} color="#E0E6E3" />
      <pointLight position={[0, 10, 0]} intensity={0.4} color="#39FF88" distance={30} />
      <pointLight position={[-8, 5, -8]} intensity={0.2} color="#39FF88" distance={20} />
      <pointLight position={[8, 5, 8]} intensity={0.15} color="#1B6B3A" distance={20} />

      {/* ── Fog for depth ──────────────────────────────────────── */}
      <fog attach="fog" args={['#0A0E0F', 15, 35]} />

      {/* ── Grid floor (tactical radar) ────────────────────────── */}
      <gridHelper
        args={[40, 40, '#1B6B3A', '#0F1A14']}
        position={[0, -4, 0]}
        material-opacity={0.25}
        material-transparent={true}
      />

      {/* ── Ambient particles ──────────────────────────────────── */}
      <AmbientParticles count={150} reducedMotion={reducedMotion} />

      {/* ── Connection lines ───────────────────────────────────── */}
      {connections.map((conn, i) => {
        const sourceNode = nodes.get(conn.source);
        const targetNode = nodes.get(conn.target);
        if (!sourceNode || !targetNode) return null;

        return (
          <ConnectionLine
            key={`${conn.source}-${conn.target}`}
            sourcePos={sourceNode.position}
            targetPos={targetNode.position}
            threat={conn.threat || false}
            severity={conn.severity || 'none'}
            reducedMotion={reducedMotion}
          />
        );
      })}

      {/* ── Network nodes ──────────────────────────────────────── */}
      {nodesArray.map((node) => (
        <group key={node.id}>
          <NetworkNode node={node} reducedMotion={reducedMotion} />
          <NodeLabel node={node} />
        </group>
      ))}

      {/* ── Pulse controller (spawns shockwave rings on cadence) ── */}
      <PulseController nodes={nodes} reducedMotion={reducedMotion} onSpawn={spawnRing} />

      {/* ── Shockwave rings ────────────────────────────────────── */}
      {shockwaves.map((sw) => (
        <ShockwaveRing
          key={sw.id}
          position={sw.position}
          color={sw.color}
          nodeRadius={sw.nodeRadius}
          reducedMotion={reducedMotion}
          onComplete={() => removeShockwave(sw.id)}
        />
      ))}

      {/* ── Camera controls ────────────────────────────────────── */}
      <OrbitControls
        enableDamping
        dampingFactor={0.05}
        minDistance={5}
        maxDistance={25}
        maxPolarAngle={Math.PI / 2}
        autoRotate
        autoRotateSpeed={0.3}
      />
    </Canvas>
  );
}
