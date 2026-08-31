/** @type {import('pm2').StartOptions} */
module.exports = {
  apps: [
    {
      name: 'julaba',
      cwd: __dirname,
      script: '.next/standalone/server.js',
      interpreter: 'node',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 5000,
      listen_timeout: 10000,
      wait_ready: false,
      time: true,
      merge_logs: true,
      env_production: {
        NODE_ENV: 'production',
        HOSTNAME: '127.0.0.1',
        PORT: 2000,
      },
    },
  ],
}
