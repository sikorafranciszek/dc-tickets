// ecosystem.config.cjs
module.exports = {
  apps: [
    {
      name: "dc-tickets",
      script: "src/index.ts",         // Bun potrafi odpalić TS bez kompilacji
      interpreter: "/root/.bun/bin/bun", // podaj pełną ścieżkę do bun
      watch: false,
      env: {
        NODE_ENV: "production",
        // Jeśli potrzebujesz, możesz dopchnąć PATH, ale podajemy pełną ścieżkę powyżej
        // PATH: `${process.env.HOME}/.bun/bin:${process.env.PATH}`,
      },
      log_date_format: "YYYY-MM-DD HH:mm:ss",
      // opcjonalnie:
      // max_restarts: 10,
      // restart_delay: 3000,
    },
  ],
};
