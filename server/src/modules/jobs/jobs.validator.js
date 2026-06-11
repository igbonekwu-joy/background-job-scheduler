import Joi from 'joi';

const VALID_INTERVALS = ['every_1_minute', 'every_5_minutes', 'every_1_hour'];

const createJobSchema = Joi.object({
  name: Joi.string().trim().min(1).max(200).required().messages({
    'string.empty': 'name is required',
    'any.required': 'name is required',
  }),

  type: Joi.string().trim().min(1).max(100).required(),

  payload: Joi.object().default({}),

  priority: Joi.number().integer().valid(1, 2, 3).default(2).messages({
    'any.only': 'priority must be 1 (high), 2 (medium), or 3 (low)',
  }),

  scheduled_at: Joi.date().iso().min('now').default(() => new Date()).messages({
    'date.min': 'scheduled_at cannot be in the past',
    'date.format': 'scheduled_at must be a valid ISO 8601 date',
  }),

  recurring_interval: Joi.string()
    .valid(...VALID_INTERVALS)
    .optional()
    .messages({
      'any.only': `recurring_interval must be one of: ${VALID_INTERVALS.join(', ')}`,
    }),

  max_retries: Joi.number().integer().min(0).max(10).default(3),

  dependencies: Joi.array()
    .items(Joi.string().uuid({ version: 'uuidv4' }))
    .default([])
    .messages({
      'string.guid': 'each dependency_job_id must be a valid UUID',
    }),
});

export const validateCreateJob = (data) => {
  const { error, value } = createJobSchema.validate(data, {
    abortEarly: false,   // collect all errors, not just the first
    stripUnknown: true,  // drop any fields not in the schema
  });

  if (error) {
    const message = error.details.map((d) => d.message).join(', ');
    return { error: message };
  }

  return value; 
};