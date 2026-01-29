module.exports = {
  apps: [{
    name: 'baileys-waapi',
    script: 'node_modules/tsx/dist/cli.mjs',
    args: 'web-server.ts',
    cwd: 'C:/laragon/www/Baileys/Baileys',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_file: './logs/pm2-combined.log',
    time: true,
    merge_logs: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
  }]
};
