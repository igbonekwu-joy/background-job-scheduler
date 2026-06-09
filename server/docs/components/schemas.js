/**
 * @swagger
 * components:
 *   schemas:
 *     JobStatus:
 *       type: string
 *       enum: [pending, processing, completed, failed, cancelled]
 *
 *     RecurringInterval:
 *       type: string
 *       enum: [every_1_minute, every_5_minutes, every_1_hour]
 *
 *     CreateJobRequest:
 *       type: object
 *       required: [type]
 *       properties:
 *         type:
 *           type: string
 *           minLength: 1
 *           maxLength: 100
 *           example: send_email
 *         payload:
 *           type: object
 *           additionalProperties: true
 *           default: {}
 *           example: { to: "user@example.com", subject: "Hello" }
 *         priority:
 *           type: integer
 *           enum: [1, 2, 3]
 *           default: 2
 *           description: 1 = high, 2 = medium, 3 = low
 *         scheduled_at:
 *           type: string
 *           format: date-time
 *           description: ISO 8601 timestamp; must not be in the past
 *         recurring_interval:
 *           $ref: '#/components/schemas/RecurringInterval'
 *         max_retries:
 *           type: integer
 *           minimum: 0
 *           maximum: 10
 *           default: 3
 *         dependencies:
 *           type: array
 *           items:
 *             type: string
 *             format: uuid
 *           default: []
 *
 *     RetryDlqRequest:
 *       type: object
 *       properties:
 *         retried_by:
 *           type: string
 *           default: engineer
 *           example: engineer
 *
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           example: error
 *         error:
 *           type: string
 */
