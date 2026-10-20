import react from '@vitejs/plugin-react';
import { build, createServer, preview } from 'vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const command = process.argv[2] || 'dev';

const config = {
  configFile: false,
  root,
  plugins: [react()],
  server: {
    host: process.env.HOST || '0.0.0.0',
    port: Number(process.env.PORT || 3456),
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || 'http://127.0.0.1:8999',
        changeOrigin: true,
      },
    },
  },
};

if (command === 'build') {
  await build(config);
} else if (command === 'preview') {
  const server = await preview({ ...config, preview: { host: config.server.host } });
  server.printUrls();
} else if (command === 'dev') {
  const server = await createServer(config);
  await server.listen();
  server.printUrls();
} else {
  throw new Error(`Unknown Vite command: ${command}. Use dev, build, or preview.`);
}
