module.exports = {
  apps: [
    {
      name: 'proxy-server',
      script: 'proxy-server.js',
      cwd: '/Users/radityakusuma/Documents/crypto-scanner',
      watch: false,
      autorestart: true,
      restart_delay: 3000,       // tunggu 3 detik sebelum restart
      max_restarts: 20,          // max 20x restart sebelum dianggap error fatal
      min_uptime: '10s',         // harus hidup ≥10s agar restart tidak dihitung
      exp_backoff_restart_delay: 500,  // backoff: 500ms, 1s, 2s, ... max 15s
      error_file: 'logs/proxy-error.log',
      out_file:   'logs/proxy-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'signal-bot',
      script: 'signal-bot.js',
      cwd: '/Users/radityakusuma/Documents/crypto-scanner',
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '15s',
      exp_backoff_restart_delay: 1000,
      error_file: 'logs/signal-bot-error.log',
      out_file:   'logs/signal-bot-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'auto-trader',
      script: 'auto-trader.js',
      cwd: '/Users/radityakusuma/Documents/crypto-scanner',
      watch: false,
      autorestart: true,
      restart_delay: 5000,
      max_restarts: 10,
      min_uptime: '15s',
      exp_backoff_restart_delay: 1000,
      error_file: 'logs/auto-trader-error.log',
      out_file:   'logs/auto-trader-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
