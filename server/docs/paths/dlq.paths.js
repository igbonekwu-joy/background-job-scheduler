/**
 * @swagger
 * /api/dlq:
 *   get:
 *     summary: List Dead Letter Queue entries
 *     tags: [Dead Letter Queue]
 *     parameters:
 *       - in: query
 *         name: include_resolved
 *         schema:
 *           type: boolean
 *           default: false
 *         description: Include entries that have already been resolved
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *     responses:
 *       200:
 *         description: DLQ entries returned successfully
 */

/**
 * @swagger
 * /api/dlq/{id}:
 *   get:
 *     summary: Get a single DLQ entry
 *     tags: [Dead Letter Queue]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: DLQ entry returned successfully
 *       404:
 *         description: Entry not found
 */

/**
 * @swagger
 * /api/dlq/{id}/retry:
 *   post:
 *     summary: Re-queue a failed job from the DLQ
 *     tags: [Dead Letter Queue]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RetryDlqRequest'
 *     responses:
 *       200:
 *         description: Job re-queued successfully
 *       404:
 *         description: Entry not found
 */
