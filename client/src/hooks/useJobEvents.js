import { useEffect, useRef } from 'react';
import { sseUrl } from '../api/config.js';

export function useJobEvents(onEvent, { enabled = true } = {}) {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  });

  useEffect(() => {
    if (!enabled) return;

    const es = new EventSource(sseUrl('/api/events'));

    es.addEventListener('open', () => {
      onEventRef.current({ _type: 'connected' });
    });

    es.addEventListener('job.event', (e) => {
      try {
        onEventRef.current(JSON.parse(e.data));
      } catch {
        // ignore malformed payloads
      }
    });

    es.addEventListener('stats', (e) => {
      try {
        onEventRef.current({ _type: 'stats', stats: JSON.parse(e.data) });
      } catch {
        // ignore malformed payloads
      }
    });

    return () => es.close();
  }, [enabled]);
}
