import { fetchStats } from "../jobs/jobs.service.js";
import { startJobEventListener } from "../../utils/jobEvents.js";

const clients = new Set();

function writeEvent(res, eventName, data) {
  try {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(res);
  }
}

function broadcastJobEvent(data) {
  for (const client of clients) {
    writeEvent(client, 'job.event', data);
  }

  fetchStats()
    .then((stats) => {
      for (const client of clients) {
        writeEvent(client, 'stats', stats.data.stats);
      }
    })
    .catch(() => {});
}

startJobEventListener(broadcastJobEvent);

export const fetchEvents = async (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();
    
    const stats = await fetchStats();
    writeEvent(res, 'stats', stats.data.stats);
    
    const heartbeat = setInterval(() => {
      try {
        res.write(': heartbeat\n\n');
      } catch {
        clearInterval(heartbeat);
        clients.delete(res);
      }
    }, 15_000);
    
    clients.add(res);
    
    req.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
    });
};
