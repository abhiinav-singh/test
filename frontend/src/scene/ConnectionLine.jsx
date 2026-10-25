import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Connection line between two network nodes with animated packet pulse.
 * - Default: thin dim green line
 * - Threat: transitions to red, thickens
 * - Packet pulse: small emissive sphere traveling along the line
 */
export default function ConnectionLine({
  sourcePos,
  targetPos,
  threat = false,
  severity = 'none',
  reducedMotion = false,
}) {
  const pulseRef = useRef();
  const lineRef = useRef();
  const pulseProgress = useRef(Math.random()); // Start at random offset
  const pulseSpeed = useMemo(() => 0.3 + Math.random() * 0.3, []);

  // Colors
  const normalColor = useMemo(() => new THREE.Color('#39FF88'), []);
  const threatColor = useMemo(() => new THREE.Color('#FF3B30'), []);
  const amberColor = useMemo(() => new THREE.Color('#D9A441'), []);

  const currentColor = useRef(new THREE.Color('#39FF88'));

  // Midpoint for line geometry
  const points = useMemo(() => {
    const start = new THREE.Vector3(...sourcePos);
    const end = new THREE.Vector3(...targetPos);
    return [start, end];
  }, [sourcePos, targetPos]);

  const lineGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    return geo;
  }, [points]);

  useFrame((_, delta) => {
    // Color transition
    const targetClr = threat
      ? severity === 'medium'
        ? amberColor
        : threatColor
      : normalColor;

    const lerpFactor = reducedMotion ? 1 : 1 - Math.pow(0.01, delta);
    currentColor.current.lerp(targetClr, lerpFactor);

    // Update line color
    if (lineRef.current) {
      lineRef.current.material.color.copy(currentColor.current);
      lineRef.current.material.opacity = threat ? 0.6 : 0.15;
    }

    // Animate packet pulse along line
    if (pulseRef.current && !reducedMotion) {
      pulseProgress.current += pulseSpeed * delta;
      if (pulseProgress.current > 1) pulseProgress.current = 0;

      const t = pulseProgress.current;
      const start = new THREE.Vector3(...sourcePos);
      const end = new THREE.Vector3(...targetPos);
      pulseRef.current.position.lerpVectors(start, end, t);
    }
  });

  const pulseSize = threat ? 0.08 : 0.04;

  return (
    <group>
      {/* Connection line */}
      <line ref={lineRef} geometry={lineGeometry}>
        <lineBasicMaterial
          color="#39FF88"
          transparent
          opacity={0.15}
          depthWrite={false}
        />
      </line>

      {/* Traveling packet pulse */}
      <mesh ref={pulseRef} position={sourcePos}>
        <sphereGeometry args={[pulseSize, 8, 8]} />
        <meshBasicMaterial
          color={threat ? '#FF3B30' : '#39FF88'}
          transparent
          opacity={0.9}
        />
      </mesh>
    </group>
  );
}
