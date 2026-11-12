import dotenv from 'dotenv';
dotenv.config();

import { validateEnv } from './config';
import { app } from './app';

validateEnv();

const PORT = Number(process.env.PORT ?? 3000);

app.listen(PORT, () => {
  console.log(`[QMS Server] Running on http://localhost:${PORT}`);
});
