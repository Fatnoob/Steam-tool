import fs from 'node:fs/promises';
import path from 'node:path';
import { fallbackGames } from './fallbackGames.js';

const CACHE_DIR = path.join(process.cwd(), 'data', 'daily');
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const NEW_GAME_WINDOW_DAYS = 180;

const parseReleaseDate = (rawDate) => {
  if (!rawDate || typeof rawDate !== 'string') return null;
  const normalized = rawDate.replace(/,/g, '').trim();
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const getDaysOld = (releaseDate) => {
  if (!releaseDate) return 365;
  return Math.max(1, Math.floor((new Date() - releaseDate) / ONE_DAY_MS));
};

const normalizeWishlistSignal = (positive = 0, negative = 0) => Number(positive || 0) + Number(negative || 0);

const isLikelyNewOrUpcoming = ({ daysOld, comingSoon, sourceFlags }) => {
  if (comingSoon) return true;
  if (daysOld <= NEW_GAME_WINDOW_DAYS) return true;
  if (sourceFlags?.fromNewReleases || sourceFlags?.fromComingSoon) return true;
  return false;
};

export const calculatePopularityScore = ({ ccu = 0, followers = 0, wishlistSignal = 0, releaseDate = null }) => {
  const daysOld = getDaysOld(releaseDate);
  const freshnessBoost = 1 / Math.sqrt(daysOld);

  return (
    (Math.log10(ccu + 1) * 0.5) +
    (Math.log10(followers + 1) * 0.33) +
    (Math.log10(wishlistSignal + 1) * 0.13) +
    (freshnessBoost * 0.04)
  );
};

export const calculateEmergingScore = ({
  ccu = 0,
  followers = 0,
  wishlistSignal = 0,
  releaseDate = null,
  comingSoon = false,
  sourceFlags = {},
  categories = [],
}) => {
  const daysOld = getDaysOld(releaseDate);
  const freshnessBoost = 1 / Math.sqrt(daysOld);
  const momentumByFollowers = Math.log10(((ccu * 35) / (followers + 200)) + 1);
  const momentumByAge = Math.log10(((ccu * 7) / (daysOld + 2)) + 1);
  const interestSignal = Math.log10((followers * 0.8) + wishlistSignal + 1);
  const giantPenalty = 1 / (1 + Math.log10(followers + 20));

  const earlyAccessBonus = categories.includes('Early Access') ? 0.04 : 0;
  const newReleaseBonus = sourceFlags.fromNewReleases ? 0.06 : 0;
  const comingSoonBonus = comingSoon || sourceFlags.fromComingSoon ? 0.08 : 0;
  const hotListBonus = sourceFlags.fromHotList ? 0.05 : 0;
  const nextFestLikeBonus = sourceFlags.fromUpcomingList ? 0.05 : 0;

  const base = (
    (freshnessBoost * 0.33) +
    (momentumByFollowers * 0.25) +
    (momentumByAge * 0.22) +
    (interestSignal * 0.2)
  );

  return (base * giantPenalty) + earlyAccessBonus + newReleaseBonus + comingSoonBonus + hotListBonus + nextFestLikeBonus;
};

const todayKey = () => new Date().toISOString().split('T')[0];
const cachePathForToday = () => path.join(CACHE_DIR, `${todayKey()}.json`);

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  return res.json();
}

async function getSteamSpyTop2Weeks() {
  const payload = await fetchJson('https://steamspy.com/api.php?request=top100in2weeks');
  return Object.values(payload).map((game) => ({ ...game, sourceFlags: { fromTop2Weeks: true } }));
}

async function getSteamSpyHot100() {
  const payload = await fetchJson('https://steamspy.com/api.php?request=hot100');
  return Object.values(payload).map((game) => ({ ...game, sourceFlags: { fromHotList: true } }));
}

async function getFeaturedCategories() {
  return fetchJson('https://store.steampowered.com/api/featuredcategories/?cc=us&l=en');
}

function extractFeaturedItems(featured) {
  const picked = [];
  const pushItems = (items, flags) => {
    for (const item of items || []) {
      if (!item?.id) continue;
      picked.push({
        appid: item.id,
        name: item.name || `App ${item.id}`,
        ccu: 0,
        followers: 0,
        positive: 0,
        negative: 0,
        sourceFlags: flags,
      });
    }
  };

  pushItems(featured?.new_releases?.items, { fromNewReleases: true });
  pushItems(featured?.coming_soon?.items, { fromComingSoon: true, fromUpcomingList: true });
  pushItems(featured?.specials?.items, { fromSpecials: true });

  return picked;
}

function mergeSignals(base, incoming) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value) merged[key] = true;
  }
  return merged;
}

function dedupeCandidates(candidates) {
  const byId = new Map();
  for (const game of candidates) {
    const appId = String(game.appid || game.appId);
    if (!appId) continue;

    if (!byId.has(appId)) {
      byId.set(appId, {
        ...game,
        appid: Number(appId),
        sourceFlags: { ...(game.sourceFlags || {}) },
      });
      continue;
    }

    const current = byId.get(appId);
    current.ccu = Math.max(Number(current.ccu || 0), Number(game.ccu || 0));
    current.followers = Math.max(Number(current.followers || 0), Number(game.followers || 0));
    current.positive = Math.max(Number(current.positive || 0), Number(game.positive || 0));
    current.negative = Math.max(Number(current.negative || 0), Number(game.negative || 0));
    current.name = current.name || game.name;
    current.sourceFlags = mergeSignals(current.sourceFlags, game.sourceFlags || {});
  }

  return Array.from(byId.values());
}

async function getAppDetails(appId) {
  const payload = await fetchJson(`https://store.steampowered.com/api/appdetails?appids=${appId}&l=english`);
  const entry = payload?.[appId];
  if (!entry?.success) return null;
  return entry.data;
}

function buildGameRecord(game, details) {
  const releaseDateObj = parseReleaseDate(details?.release_date?.date);
  const releaseDate = releaseDateObj ? releaseDateObj.toISOString().split('T')[0] : null;
  const daysOld = getDaysOld(releaseDateObj);
  const comingSoon = Boolean(details?.release_date?.coming_soon);
  const categories = details?.categories?.map((cat) => cat.description) || [];

  const rawRecord = {
    appId: game.appid,
    name: game.name,
    ccu: Number(game.ccu || 0),
    followers: Number(game.followers || 0),
    wishlistSignal: normalizeWishlistSignal(game.positive, game.negative),
    releaseDate,
    daysOld,
    comingSoon,
    sourceFlags: game.sourceFlags || {},
    price: (details?.is_free ? 'Free' : details?.price_overview?.final_formatted) || 'N/A',
    headerImage: details?.header_image || null,
    genres: details?.genres?.map((genre) => genre.description) || [],
    categories,
    shortDescription: details?.short_description || '',
  };

  return scoreGame(rawRecord);
}

function scoreGame(rawGame) {
  const releaseDate = rawGame.releaseDate ? new Date(rawGame.releaseDate) : null;
  const daysOld = rawGame.daysOld || getDaysOld(releaseDate);
  const isNewOrUpcoming = isLikelyNewOrUpcoming({
    daysOld,
    comingSoon: rawGame.comingSoon,
    sourceFlags: rawGame.sourceFlags,
  });

  return {
    ...rawGame,
    daysOld,
    isNewOrUpcoming,
    popularityScore: Number(calculatePopularityScore({
      ccu: rawGame.ccu,
      followers: rawGame.followers,
      wishlistSignal: rawGame.wishlistSignal,
      releaseDate,
    }).toFixed(4)),
    emergingScore: Number(calculateEmergingScore({
      ccu: rawGame.ccu,
      followers: rawGame.followers,
      wishlistSignal: rawGame.wishlistSignal,
      releaseDate,
      comingSoon: rawGame.comingSoon,
      sourceFlags: rawGame.sourceFlags,
      categories: rawGame.categories || [],
    }).toFixed(4)),
  };
}

function shapePayload(games, source) {
  const mostPopular = [...games].sort((a, b) => b.popularityScore - a.popularityScore).slice(0, 12);

  const emergingPool = games.filter((game) => game.isNewOrUpcoming || game.sourceFlags?.fromHotList);
  const emergingHits = [...emergingPool]
    .sort((a, b) => b.emergingScore - a.emergingScore)
    .slice(0, 12);

  return {
    generatedAt: new Date().toISOString(),
    source,
    algorithm: {
      mostPopular: 'Active players + followers + wishlist proxy, with minor freshness weighting.',
      emergingHits: 'Strong emphasis on newness, momentum-by-age, follower conversion, and coming-soon/new-release discovery signals.',
      dataSources: [
        'SteamSpy top100in2weeks',
        'SteamSpy hot100',
        'Steam Store featured categories (new releases + coming soon)',
        'Steam app details',
      ],
    },
    mostPopular,
    emergingHits,
    games: mostPopular,
  };
}

async function writeCache(data) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePathForToday(), JSON.stringify(data, null, 2), 'utf8');
}

async function readCache() {
  try {
    const raw = await fs.readFile(cachePathForToday(), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeCachedPayload(payload) {
  if (!payload) return null;
  if (Array.isArray(payload.mostPopular) && Array.isArray(payload.emergingHits)) return payload;
  if (!Array.isArray(payload.games)) return null;

  const rescored = payload.games.map((game) => scoreGame(game));
  return shapePayload(rescored, payload.source || 'cache-upgraded');
}

function buildFallbackPayload() {
  const games = fallbackGames.map((game) => scoreGame(game));
  return shapePayload(games, 'fallback');
}

async function collectCandidatesFromLiveSources() {
  const [top2WeeksResult, hot100Result, featuredResult] = await Promise.allSettled([
    getSteamSpyTop2Weeks(),
    getSteamSpyHot100(),
    getFeaturedCategories(),
  ]);

  const top2Weeks = top2WeeksResult.status === 'fulfilled' ? top2WeeksResult.value : [];
  const hot100 = hot100Result.status === 'fulfilled' ? hot100Result.value : [];
  const featuredItems = featuredResult.status === 'fulfilled' ? extractFeaturedItems(featuredResult.value) : [];

  const allCandidates = dedupeCandidates([...top2Weeks, ...hot100, ...featuredItems]);
  if (!allCandidates.length) {
    throw new Error('No live candidates were available from Steam sources.');
  }

  return allCandidates;
}

export async function getTrendingGames({ forceRefresh = false } = {}) {
  if (!forceRefresh) {
    const cached = normalizeCachedPayload(await readCache());
    if (cached) return cached;
  }

  try {
    const candidates = await collectCandidatesFromLiveSources();
    const enriched = [];

    for (const game of candidates.slice(0, 120)) {
      try {
        const details = await getAppDetails(game.appid);
        if (details?.type !== 'game') continue;
        enriched.push(buildGameRecord(game, details));
      } catch {
        // Skip only this title; keep the pipeline robust.
      }
    }

    if (!enriched.length) throw new Error('No enriched games available from live data.');

    const payload = shapePayload(enriched, 'steam-live');
    await writeCache(payload);
    return payload;
  } catch {
    const payload = buildFallbackPayload();
    await writeCache(payload);
    return payload;
  }
}
