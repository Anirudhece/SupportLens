import { createApp } from './app.js';
import { loadConfig } from './config/environment.js';

const config = loadConfig();
const app = createApp({ config });

app.listen(config.port, config.host, () => {
  console.log(`SupportLens API listening on http://${config.host}:${config.port}`);
});
