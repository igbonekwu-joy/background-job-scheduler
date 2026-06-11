import { fetchStats } from "../jobs/jobs.service.js";
import { addSseClient, removeSseClient, writeSseEvent } from "./sse.service.js";

export const getEvents = async (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const stats = await fetchStats();
    writeSseEvent(res, 'stats', stats);

    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        removeSseClient(res);
      }
    }, 15_000);

    addSseClient(res);

    req.on('close', () => {
        clearInterval(heartbeat);
        removeSseClient(res);
    });
};
