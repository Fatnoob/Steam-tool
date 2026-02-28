import {
  analyzeGameSentimentByAppId,
  discoverGamesForBackgroundCrawl,
} from './steamService.js';
import {
  getCrawlerStatus,
  listStoredGames,
  updateCrawlerStatus,
  upsertGameAnalysis,
} from './reviewDatabase.js';

let running = false;

const DEFAULT_CRAWL_PER_GAME = Number(process.env.BG_CRAWLER_MAX_REVIEWS_PER_GAME || 5000);
const DEFAULT_MAX_GAMES = Number(process.env.BG_CRAWLER_MAX_GAMES || 500);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function getBackgroundCrawlerStatus() {
  return getCrawlerStatus();
}

export async function getStoredGames(limit = 50) {
  return listStoredGames(limit);
}

export async function startBackgroundCrawler() {
  if (running) {
    return { started: false, message: 'Crawler already running.' };
  }

  running = true;
  updateCrawlerStatus({
    running: true,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    scanned: 0,
    stored: 0,
    failed: 0,
    message: 'Discovering game catalog...',
  }).catch(() => {});

  (async () => {
    let scanned = 0;
    let stored = 0;
    let failed = 0;

    try {
      const catalog = await discoverGamesForBackgroundCrawl();
      const targets = catalog.slice(0, DEFAULT_MAX_GAMES);

      await updateCrawlerStatus({ message: `Crawling ${targets.length} games...` });

      for (const game of targets) {
        scanned += 1;

        try {
          const analysis = await analyzeGameSentimentByAppId(game.appId, game.name, {
            limitReviews: DEFAULT_CRAWL_PER_GAME,
            allowFallback: false,
          });

          await upsertGameAnalysis({
            appId: game.appId,
            name: game.name,
            source: analysis.source,
            crawl: analysis.crawl,
            analysis: analysis.analysis,
          });

          stored += 1;
        } catch (error) {
          failed += 1;
          await upsertGameAnalysis({
            appId: game.appId,
            name: game.name,
            source: 'error',
            error: error.message,
            crawl: {
              comprehensive: false,
              pagesFetched: 0,
              reviewsCollected: 0,
              totalReportedBySteam: null,
              coveragePercent: null,
            },
            analysis: null,
          });
        }

        await updateCrawlerStatus({
          scanned,
          stored,
          failed,
          message: `Crawled ${scanned}/${targets.length}`,
        });

        await sleep(120);
      }

      await updateCrawlerStatus({
        running: false,
        finishedAt: new Date().toISOString(),
        scanned,
        stored,
        failed,
        message: `Completed. Stored ${stored} analyses (${failed} failed).`,
      });
    } catch (error) {
      await updateCrawlerStatus({
        running: false,
        finishedAt: new Date().toISOString(),
        scanned,
        stored,
        failed,
        message: `Crawler failed: ${error.message}`,
      });
    } finally {
      running = false;
    }
  })();

  return { started: true, message: 'Background crawler started.' };
}
