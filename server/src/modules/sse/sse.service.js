import { fetchStats } from "../jobs/jobs.service.js";
import { startJobEventListener } from "../../utils/jobEvents.js";

const clients = new Set();

export function writeSseEvent(res, eventName, data) {
  try {
    res.write(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`);
  } catch {
    clients.delete(res);
  }
}

export function addSseClient(res) {
  clients.add(res);
}

export function removeSseClient(res) {
  clients.delete(res);
}

function broadcastJobEvent(data) {
  for (const client of clients) {
    writeSseEvent(client, 'job.event', data);
  }

  fetchStats()
    .then((stats) => {
      for (const client of clients) {
        writeSseEvent(client, 'stats', stats);
      }
    })
    .catch(() => {});
}

startJobEventListener(broadcastJobEvent);
