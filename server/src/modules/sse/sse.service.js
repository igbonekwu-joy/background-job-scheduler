import { fetchStats } from "../jobs/jobs.service.js";

const clients = new Set();

emitter.on('job.event', (data) => {
  const payload = `event: job.event\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) client.write(payload);
});

export const fetchEvents = async (req, res) => {
    res.setHeader('Content-Type',  'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection',    'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // stops Nginx from buffering SSE
    res.flushHeaders();
    
    // Send current stats the moment the client connects
    const stats = await fetchStats();
    res.write(`event: stats\ndata: ${JSON.stringify(stats.data.stats)}\n\n`);
    
    // Keep connection alive with a heartbeat every 15s
    const heartbeat = setInterval(() => {
        res.write(': heartbeat\n\n');
    }, 15_000);
    
    clients.add(res);
    
    req.on('close', () => {
        clearInterval(heartbeat);
        clients.delete(res);
    });
};

// export const broadcast = (eventName, data) => {
//   const payload = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
//   for (const client of clients) {
//     client.write(payload);
//   }
// }