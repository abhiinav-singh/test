import { useMemo } from 'react';
import { Html } from '@react-three/drei';

/**
 * Floating label for a network node.
 * Shows hostname in monospace, positioned below the node.
 */
export default function NodeLabel({ node }) {
  const style = useMemo(
    () => ({
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '9px',
      color:
        node.threatState === 'critical'
          ? '#FF3B30'
          : node.threatState === 'medium'
          ? '#D9A441'
          : '#6B7C75',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      userSelect: 'none',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      textShadow:
        node.threatState === 'critical'
          ? '0 0 8px rgba(255,59,48,0.5)'
          : 'none',
    }),
    [node.threatState]
  );

  return (
    <Html
      position={[node.position[0], node.position[1] - 0.5, node.position[2]]}
      center
      distanceFactor={12}
      style={{ pointerEvents: 'none' }}
    >
      <div style={style}>{node.hostname}</div>
    </Html>
  );
}
