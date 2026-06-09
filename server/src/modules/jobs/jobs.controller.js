import { StatusCodes } from "http-status-codes";
import { saveJob } from "./jobs.service.js";
import { validateCreateJob } from "./jobs.validator.js";

export const createJob = async (req, res) => {
    const { type, payload, priority = 2, scheduled_at, recurring_interval, max_retries = 0, dependencies = [] } = req.body;

    // Validation
    const validated = validateCreateJob({ type, payload, priority, scheduled_at, recurring_interval, max_retries, dependencies });
    if (validated.error) {
        return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({ status: 'error', error: validated.error });
    }

    const result = await saveJob(validated);
    res.status(StatusCodes.CREATED).json(result.data);
}