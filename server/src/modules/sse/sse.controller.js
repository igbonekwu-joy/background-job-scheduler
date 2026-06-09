import { fetchEvents } from "./sse.service.js";

export const getEvents = async (req, res) => {
    await fetchEvents(req, res);
};