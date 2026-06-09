export const swaggerOptions = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Background Jobs Scheduler',
      version: '1.0.0',
      description: 'API for scheduling, monitoring, and recovering background jobs.',
    },
    tags: [
      { name: 'Jobs', description: 'Job scheduling and lifecycle management' },
      { name: 'Dead Letter Queue', description: 'Inspection and recovery of permanently failed jobs' },
      { name: 'Server Side Events', description: 'Real-time job event stream' },
    ],
  },
  apis: ['./docs/components/*.js', './docs/paths/*.js'],
};
