import winston from 'winston';

 // Validates required payload fields
 // Simulates 50–400ms network latency
 // Fails 20% of attempts (exercises retry logic)
 // Returns a structured receipt on success
 
export async function sendEmail(job) {
  const { id, payload } = job;

  if (!payload?.to)      throw new Error('payload.to is required');
  if (!payload?.subject) throw new Error('payload.subject is required');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.to))
    throw new Error(`Invalid email address: ${payload.to}`);

  winston.info('email_handler: sending', { job_id: id, to: payload.to });

  await new Promise(r => setTimeout(r, 50 + Math.random() * 350));

  if (Math.random() < 0.2)
    throw new Error('SMTP 421: service temporarily unavailable');

  const receipt = {
    to:         payload.to,
    subject:    payload.subject,
    message_id: `<${id}@dilamme.io>`,
    sent_at:    new Date().toISOString(),
  };

  winston.info('email_handler: delivered', { job_id: id, ...receipt });
  return receipt;
}