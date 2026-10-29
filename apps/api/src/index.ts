import { buildApp } from './app';
import { config } from './config';

const app = await buildApp();
try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    app.close().finally(() => process.exit(0));
  });
}
