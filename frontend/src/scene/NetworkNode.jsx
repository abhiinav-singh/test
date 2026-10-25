import { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * A single network node rendered as a glowing icosahedron in 3D space.
 * - Idle: gentle floating bob + slow rotation
 * - Threat: color transitions to red, triggers shockwave
 */
export default function NetworkNode({ node, reducedMotion = false }) {
  const meshRef = useRef();
  const glowRef = useRef();
  const materialRef = useRef();
  const glowMaterialRef = useRef();

  // Unique phase offset so nodes don't bob in sync
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  const bobSpeed = useMemo(() => 0.3 + Math.random() * 0.2, []);
  const bobAmount = useMemo(() => 0.15 + Math.random() * 0.1, []);
  const rotSpeed = useMemo(() => 0.1 + Math.random() * 0.15, []);

  // Color targets
  const colors = useMemo(
    () => ({
      none: new THREE.Color('#39FF88'),
      medium: new THREE.Color('#D9A441'),
      critical: new THREE.Color('#FF3B30'),
    }),
    []
  );

  const currentColor = useRef(new THREE.Color('#39FF88'));
  const targetColor = useRef(new THREE.Color('#39FF88'));
  const currentEmissiveIntensity = useRef(0.3);
  const targetEmissiveIntensity = useRef(0.3);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    const threat = node.threatState || 'none';
    targetColor.current.copy(colors[threat] || colors.none);
    targetEmissiveIntensity.current = threat === 'critical' ? 1.2 : threat === 'medium' ? 0.7 : 0.3;

    // Smooth color transition (~400ms)
    const lerpFactor = reducedMotion ? 1 : 1 - Math.pow(0.001, delta);
    currentColor.current.lerp(targetColor.current, lerpFactor);
    currentEmissiveIntensity.current = THREE.MathUtils.lerp(
      currentEmissiveIntensity.current,
      targetEmissiveIntensity.current,
      lerpFactor
    );

    // Apply to material
    if (materialRef.current) {
      materialRef.current.color.copy(currentColor.current);
      materialRef.current.emissive.copy(currentColor.current);
      materialRef.current.emissiveIntensity = currentEmissiveIntensity.current;
    }

    // Glow sphere
    if (glowMaterialRef.current) {
      glowMaterialRef.current.color.copy(currentColor.current);
      glowMaterialRef.current.opacity = 0.08 + (threat === 'critical' ? 0.12 : 0);
    }

    // Idle animation
    if (!reducedMotion) {
      const t = state.clock.elapsedTime;
      meshRef.current.position.y =
        node.position[1] + Math.sin(t * bobSpeed + phase) * bobAmount;
      meshRef.current.rotation.y += rotSpeed * delta;
      meshRef.current.rotation.x += rotSpeed * 0.3 * delta;

      if (glowRef.current) {
        glowRef.current.position.y = meshRef.current.position.y;
      }
    }
  });

  const nodeSize = node.type === 'router' ? 0.35 : node.type === 'external' ? 0.4 : 0.25;
  const glowSize = nodeSize * 3;

  return (
    <group position={node.position}>
      {/* Glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[glowSize, 16, 16]} />
        <meshBasicMaterial
          ref={glowMaterialRef}
          color="#39FF88"
          transparent
          opacity={0.08}
          depthWrite={false}
        />
      </mesh>

      {/* Core node */}
      <mesh ref={meshRef}>
        <icosahedronGeometry args={[nodeSize, 1]} />
        <meshStandardMaterial
          ref={materialRef}
          color="#39FF88"
          emissive="#39FF88"
          emissiveIntensity={0.3}
          roughness={0.3}
          metalness={0.7}
          wireframe={node.type === 'external'}
        />
      </mesh>
    </group>
  );
}
