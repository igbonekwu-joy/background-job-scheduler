const APP_DIR = process.env.APP_DIR || '/var/www/queuectl';

module.exports = {
  apps: [
    {
      name: 'queuectl-api',
      cwd: `${APP_DIR}/server`,
      script: 'server.js',
      instances: 1,
      autorestart: true,
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'queuectl-worker',
      cwd: `${APP_DIR}/server`,
      script: 'src/modules/worker/index.js',
      instances: 1,
      autorestart: true,
      env: { NODE_ENV: 'production' },
    },
  ],
};
