import { useRef, useEffect } from 'react';

/**
 * Terminal-style scrolling event log.
 * Auto-scrolls, color-coded by severity, monospace timestamps.
 */
export default function EventLog({ events }) {
  const feedRef = useRef(null);

  // Auto-scroll to bottom on new events
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [events]);

  const formatTime = (isoString) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '00:00:00';
    }
  };

  const getSeverityClass = (event) => {
    if (event.threat && event.severity === 'critical') return 'event-log__entry--critical';
    if (event.threat && event.severity === 'medium') return 'event-log__entry--medium';
    return 'event-log__entry--normal';
  };

  const formatEventType = (type) => {
    return (type || 'unknown').toUpperCase().replace(/_/g, ' ');
  };

  return (
    <aside className="event-log" id="event-log">
      {/* Header */}
      <div className="event-log__header">
        <span>Event Feed</span>
        <span>{events.length} events</span>
      </div>

      {/* Terminal prompt */}
      <div className="event-log__prompt">
        <span>root@websentinel:~$</span> monitoring...
      </div>

      {/* Event feed */}
      <div className="event-log__feed" ref={feedRef}>
        {events.map((event, i) => (
          <div
            key={`${event.timestamp}-${i}`}
            className={`event-log__entry ${getSeverityClass(event)}`}
          >
            <span className="event-log__timestamp">
              [{formatTime(event.timestamp)}]
            </span>
            <span className="event-log__type">
              {formatEventType(event.event_type)}
            </span>
            {' — '}
            {event.message}
            {event.source_hostname && (
              <span className="event-log__hosts">
                {' '}({event.source_hostname} → {event.target_hostname})
              </span>
            )}
          </div>
        ))}

        {events.length === 0 && (
          <div className="event-log__entry event-log__entry--normal">
            Waiting for network events...
          </div>
        )}
      </div>
    </aside>
  );
}
