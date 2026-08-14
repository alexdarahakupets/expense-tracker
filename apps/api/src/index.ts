import { createApp } from './app.js';
import { closeDb } from './db/client.js';
import { env } from './env.js';

const app = createApp();

const server = app.listen(env.PORT, () => {
  console.log(`api listening on http://localhost:${String(env.PORT)} (${env.NODE_ENV})`);
});

/**
 * Stop accepting connections, then drain the pool. Without this every `tsx
 * watch` restart leaks its Postgres connections until the server refuses more.
 */
function shutdown(signal: NodeJS.Signals): void {
  console.log(`${signal} received, shutting down`);

  server.close((error) => {
    if (error) {
      console.error('error closing http server', error);
    }

    void closeDb()
      .catch((closeError: unknown) => {
        console.error('error closing postgres pool', closeError);
      })
      .finally(() => {
        process.exit(error ? 1 : 0);
      });
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
