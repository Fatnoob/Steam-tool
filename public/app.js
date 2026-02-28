const inputEl = document.getElementById('gameInput');
const btnEl = document.getElementById('analyzeBtn');
const resultEl = document.getElementById('result');
const startCrawlerBtn = document.getElementById('startCrawlerBtn');
const refreshCrawlerBtn = document.getElementById('refreshCrawlerBtn');
const crawlerStatusEl = document.getElementById('crawlerStatus');
const storedGamesEl = document.getElementById('storedGames');

function list(items, formatter) {
  if (!items?.length) return '<li>None detected</li>';
  return items.map((item) => `<li>${formatter(item)}</li>`).join('');
}

function quoteList(items) {
  if (!items?.length) return '<li>No representative quotes captured</li>';
  return items.map((q) => `<li>“${q.text}” <small>(👍 ${q.votesUp}, ${q.playtimeAtReviewHours}h)</small></li>`).join('');
}

function render(payload) {
  const { game, analysis, source, crawl, fallbackReason } = payload;
  resultEl.innerHTML = `
    <article class="card">
      <h2>${game.name}</h2>
      <p class="meta">Source: ${source} · Reviews analyzed: ${analysis.totalReviewsAnalyzed}</p>
      <p class="meta">Comprehensive crawl: ${crawl.comprehensive ? 'Yes' : 'Partial'} · Pages fetched: ${crawl.pagesFetched}</p>
      <p class="meta">Collected: ${crawl.reviewsCollected} / ${crawl.totalReportedBySteam ?? 'unknown'} reviews${crawl.coveragePercent !== null ? ` (${crawl.coveragePercent}%)` : ''}</p>
      ${source === 'fallback' ? `<p class="warn">Live fetch failed: ${fallbackReason || 'unknown reason'}. Showing sample data.</p>` : ''}
      <p class="score">Sentiment score: ${analysis.sentimentScore} (${analysis.summary.label})</p>
      <div class="stats">
        <span>Positive: ${analysis.positiveCount} (${analysis.positivePercent}%)</span>
        <span>Negative: ${analysis.negativeCount}</span>
      </div>

      <h3>What players like</h3>
      <ul>${list(analysis.strengths, (item) => `${item.name} (${item.count})`)}</ul>

      <h3>Major pain points</h3>
      <ul>${list(analysis.painPoints, (item) => `${item.name} (${item.count})`)}</ul>

      <h3>Recurring keywords (negative)</h3>
      <ul>${list(analysis.recurringFeedback.negativeKeyPhrases, (item) => `${item.phrase} (${item.count})`)}</ul>

      <h3>Actionable recommendations</h3>
      <ul>${list(analysis.actionableRecommendations, (item) => item)}</ul>

      <h3>Representative positive quotes</h3>
      <ul>${quoteList(analysis.representativeQuotes.positive)}</ul>

      <h3>Representative negative quotes</h3>
      <ul>${quoteList(analysis.representativeQuotes.negative)}</ul>
    </article>
  `;
}

async function analyze() {
  const q = inputEl.value.trim();
  if (q.length < 2) {
    resultEl.innerHTML = '<p>Please enter at least 2 characters.</p>';
    return;
  }

  resultEl.innerHTML = '<p>Analyzing all available reviews… this can take time for large games.</p>';
  const res = await fetch(`/api/sentiment?q=${encodeURIComponent(q)}`);
  const data = await res.json();

  if (!res.ok || data.error) {
    resultEl.innerHTML = `<p>Failed: ${data.error || 'Unknown error'}</p>`;
    return;
  }

  render(data);
}

async function refreshCrawlerStatus() {
  const [statusRes, gamesRes] = await Promise.all([
    fetch('/api/crawler/status'),
    fetch('/api/crawler/games?limit=12'),
  ]);
  const status = await statusRes.json();
  const gamesPayload = await gamesRes.json();

  crawlerStatusEl.innerHTML = `
    <h3>Crawler status</h3>
    <p class="meta">Running: ${status.running ? 'Yes' : 'No'} · Scanned: ${status.scanned} · Stored: ${status.stored} · Failed: ${status.failed}</p>
    <p class="meta">Started: ${status.startedAt || 'n/a'} · Finished: ${status.finishedAt || 'n/a'}</p>
    <p>${status.message}</p>
  `;

  const rows = (gamesPayload.games || []).map((game) => {
    const sentiment = game.analysis?.sentimentScore;
    return `<li>#${game.appId} ${game.name} · reviews ${game.crawl?.reviewsCollected ?? 0} · sentiment ${sentiment ?? 'n/a'} · ${game.source}</li>`;
  }).join('');

  storedGamesEl.innerHTML = `
    <h3>Stored game analyses (${(gamesPayload.games || []).length})</h3>
    <ul>${rows || '<li>No stored analyses yet.</li>'}</ul>
  `;
}

async function startCrawler() {
  startCrawlerBtn.disabled = true;
  const res = await fetch('/api/crawler/start', { method: 'POST' });
  const data = await res.json();
  await refreshCrawlerStatus();
  startCrawlerBtn.disabled = false;
  if (!res.ok) {
    alert(`Failed to start crawler: ${data.error || 'Unknown error'}`);
  }
}

btnEl.addEventListener('click', analyze);
inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') analyze();
});

startCrawlerBtn.addEventListener('click', startCrawler);
refreshCrawlerBtn.addEventListener('click', refreshCrawlerStatus);
refreshCrawlerStatus();
