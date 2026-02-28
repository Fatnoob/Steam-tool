import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { analyzeGameSentiment } from './src/steamService.js';
import {
  getBackgroundCrawlerStatus,
  getStoredGames,
  startBackgroundCrawler,
} from './src/backgroundCrawler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = process.env.PORT || 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
};

async function serveFile(res, filePath) {
  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

const server = http.createServer(async (req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);

  if (reqUrl.pathname === '/api/sentiment') {
    try {
      const query = reqUrl.searchParams.get('q') || '';
      const maxReviews = Number(reqUrl.searchParams.get('maxReviews') || 0);
      const strict = reqUrl.searchParams.get('strict') === '1';
      const data = await analyzeGameSentiment(query, { limitReviews: maxReviews, allowFallback: !strict });
      json(res, 200, data);
    } catch (error) {
      json(res, 400, { error: error.message });
    }
    return;
  }

  if (reqUrl.pathname === '/api/crawler/start' && req.method === 'POST') {
    const data = await startBackgroundCrawler();
    json(res, 200, data);
    return;
  }

  if (reqUrl.pathname === '/api/crawler/status') {
    const status = await getBackgroundCrawlerStatus();
    json(res, 200, status);
    return;
  }

  if (reqUrl.pathname === '/api/crawler/games') {
    const limit = Number(reqUrl.searchParams.get('limit') || 50);
    const games = await getStoredGames(limit);
    json(res, 200, { games });
    return;
  }

  const safePath = reqUrl.pathname === '/' ? '/index.html' : reqUrl.pathname;
  const filePath = path.join(PUBLIC_DIR, path.normalize(safePath));
  await serveFile(res, filePath);
});

server.listen(PORT, () => {
  console.log(`Steam Sentiment Analyzer listening on http://localhost:${PORT}`);
});
