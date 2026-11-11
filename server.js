// Entry point. Kept at the project root so `node server.js` keeps working on Render.
import { createBoardServer } from './backend/app.js';

const PORT = Number(process.env.PORT) || 3000;
const { server } = createBoardServer();

server.listen(PORT, () => {
  console.log(`\n  Boardnom is running  ->  http://localhost:${PORT}\n`);
});
