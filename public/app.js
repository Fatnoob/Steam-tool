const popularGamesEl = document.getElementById('popularGames');
const emergingGamesEl = document.getElementById('emergingGames');
const metaEl = document.getElementById('meta');
const refreshBtn = document.getElementById('refreshBtn');

function fmt(n) {
  return Intl.NumberFormat().format(n || 0);
}

function buildBadges(game) {
  const badges = [];
  if (game.comingSoon) badges.push('Coming Soon');
  if (game.daysOld <= 30) badges.push('New <30d');
  else if (game.daysOld <= 90) badges.push('New <90d');
  if (game.sourceFlags?.fromHotList) badges.push('Hot List');
  if (game.sourceFlags?.fromNewReleases) badges.push('New Releases');
  if (game.sourceFlags?.fromUpcomingList) badges.push('Upcoming Radar');
  return badges;
}

function card(game, rank, scoreLabel, scoreKey) {
  const badges = buildBadges(game);
  return `
    <article class="card">
      ${game.headerImage ? `<img src="${game.headerImage}" alt="${game.name}" />` : ''}
      <div class="content">
        <h3>#${rank + 1} ${game.name}</h3>
        <p class="score">${scoreLabel}: ${game[scoreKey]}</p>
        <div class="badges">${badges.map((b) => `<span class="badge">${b}</span>`).join('')}</div>
        <p>${game.shortDescription || 'No description available.'}</p>
        <div class="stats">
          <span>CCU: ${fmt(game.ccu)}</span>
          <span>Followers: ${fmt(game.followers)}</span>
          <span>Wishlist signal: ${fmt(game.wishlistSignal)}</span>
          <span>Age: ${game.comingSoon ? 'Upcoming' : `${game.daysOld || 'Unknown'} days`}</span>
        </div>
      </div>
    </article>
  `;
}

function renderList(targetEl, games, scoreLabel, scoreKey) {
  targetEl.innerHTML = games.map((game, i) => card(game, i, scoreLabel, scoreKey)).join('');
}

async function load(refresh = false) {
  popularGamesEl.innerHTML = '<p>Loading popular games…</p>';
  emergingGamesEl.innerHTML = '<p>Loading breakout candidates…</p>';

  const res = await fetch(`/api/trending${refresh ? '?refresh=1' : ''}`);
  const data = await res.json();

  if (!res.ok) {
    popularGamesEl.innerHTML = `<p>Failed to load: ${data.details || data.error}</p>`;
    emergingGamesEl.innerHTML = '';
    return;
  }

  metaEl.textContent = `Updated ${new Date(data.generatedAt).toLocaleString()} · Source: ${data.source}`;
  renderList(popularGamesEl, data.mostPopular || data.games || [], 'Popularity score', 'popularityScore');
  renderList(emergingGamesEl, data.emergingHits || [], 'Emerging score', 'emergingScore');
}

refreshBtn.addEventListener('click', () => load(true));
load();
