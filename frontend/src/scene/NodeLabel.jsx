import { useMemo } from 'react';
import { Html } from '@react-three/drei';

export default function NodeLabel({ node }) {
  const threat = node.threatState;

  const style = useMemo(() => {
    const color =
      threat === 'critical' ? '#FF3B30' : threat === 'medium' ? '#D9A441' : '#C8D3CD';
    const border =
      threat === 'critical'
        ? 'rgba(255,59,48,0.5)'
        : threat === 'medium'
        ? 'rgba(217,164,65,0.5)'
        : 'rgba(255,255,255,0.08)';

    return {
      fontFamily: "'JetBrains Mono', monospace",
      fontSize: '11px',
      fontWeight: 600,
      color,
      background: 'rgba(10,14,15,0.72)',
      border: `1px solid ${border}`,
      borderRadius: '3px',
      padding: '2px 6px',
      textAlign: 'center',
      whiteSpace: 'nowrap',
      pointerEvents: 'none',
      userSelect: 'none',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
      textShadow: threat === 'critical' ? '0 0 8px rgba(255,59,48,0.5)' : 'none',
    };
  }, [threat]);

  return (
    <Html
      position={[node.position[0], node.position[1] - 0.5, node.position[2]]}
      center
      style={{ pointerEvents: 'none' }}
    >
      <div style={style}>{node.hostname}</div>
    </Html>
  );
}
