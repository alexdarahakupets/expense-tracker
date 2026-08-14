import { createApp } from './app.js';
import { env } from './env.js';

const app = createApp();

app.listen(env.PORT, () => {
  console.log(`api listening on http://localhost:${String(env.PORT)} (${env.NODE_ENV})`);
});
