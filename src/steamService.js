const STEAM_STORE_API = 'https://store.steampowered.com';
const STEAMSPY_API = 'https://steamspy.com/api.php';
const REVIEWS_PER_PAGE = 100;
const HARD_MAX_PAGES = Number(process.env.STEAM_REVIEW_MAX_PAGES || 1500);
const HARD_MAX_REVIEWS = Number(process.env.STEAM_REVIEW_MAX_REVIEWS || 100000);

const stopWords = new Set([
  'the', 'and', 'for', 'this', 'that', 'with', 'have', 'has', 'are', 'was', 'were', 'from', 'they', 'them', 'you',
  'your', 'its', 'too', 'can', 'not', 'but', 'game', 'games', 'just', 'very', 'into', 'about', 'after', 'before',
  'been', 'will', 'would', 'could', 'should', 'really', 'there', 'their', 'more', 'some', 'when', 'while', 'where',
  'what', 'than', 'then', 'out', 'all', 'any', 'our', 'had', 'did', 'does', 'much', 'many', 'still', 'also', 'only',
]);

const positiveThemes = {
  performance: ['optimized', 'smooth', 'stable', 'fps', 'performance'],
  gameplay: ['fun', 'addictive', 'combat', 'mechanics', 'gameplay'],
  content: ['content', 'variety', 'replayable', 'quests', 'missions'],
  visuals: ['graphics', 'visuals', 'art', 'beautiful', 'atmosphere'],
  value: ['worth', 'price', 'value', 'sale', 'cheap'],
  devSupport: ['update', 'patch', 'devs', 'developer', 'improved'],
};

const negativeThemes = {
  bugs: ['bug', 'broken', 'crash', 'glitch', 'issue'],
  performance: ['lag', 'stutter', 'optimization', 'fps drops', 'unplayable'],
  balance: ['balance', 'nerf', 'op', 'matchmaking', 'fair'],
  monetization: ['microtransaction', 'pay to win', 'dlc', 'cash grab', 'expensive'],
  content: ['repetitive', 'grind', 'empty', 'short', 'lacking'],
  online: ['server', 'disconnect', 'queue', 'latency', 'cheater'],
};

const fallbackReviews = [
  { review: 'Great gameplay loop and smooth performance. Developers keep patching fast.', voted_up: true },
  { review: 'Very addictive combat and lots of content for the price.', voted_up: true },
  { review: 'Atmosphere and visuals are beautiful, runs stable on my pc.', voted_up: true },
  { review: 'Fun core mechanics but matchmaking feels unfair and full of cheaters.', voted_up: false },
  { review: 'Good game but occasional crashes and bugs after the latest update.', voted_up: false },
  { review: 'Needs better optimization and less grind in late game.', voted_up: false },
];

function normalize(text = '') {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(text = '') {
  return normalize(text)
    .split(' ')
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function countThemeHits(reviews, themes) {
  const score = Object.fromEntries(Object.keys(themes).map((key) => [key, 0]));
  for (const review of reviews) {
    const text = normalize(review.review);
    for (const [theme, words] of Object.entries(themes)) {
      if (words.some((word) => text.includes(word))) score[theme] += 1;
    }
  }
  return score;
}

function topEntries(obj, limit = 3) {
  return Object.entries(obj)
    .sort((a, b) => b[1] - a[1])
    .filter(([, count]) => count > 0)
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}

function extractKeyPhrases(reviews, limit = 8) {
  const counts = new Map();
  for (const review of reviews) {
    const words = tokenize(review.review);
    for (const word of words) {
      counts.set(word, (counts.get(word) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([phrase, count]) => ({ phrase, count }));
}

function pickRepresentativeQuotes(reviews, max = 3) {
  return reviews
    .filter((review) => review.review && review.review.length > 40)
    .sort((a, b) => (b.weighted_vote_score || 0) - (a.weighted_vote_score || 0))
    .slice(0, max)
    .map((review) => ({
      text: review.review.slice(0, 280).trim(),
      votedUp: Boolean(review.voted_up),
      votesUp: Number(review.votes_up || 0),
      weightedVoteScore: Number(review.weighted_vote_score || 0),
      playtimeAtReviewHours: Number(((review.author?.playtime_at_review || 0) / 60).toFixed(1)),
    }));
}

function toImprovementActions(painPoints, negativePhrases) {
  const actions = painPoints.map((pain) => {
    if (pain.name === 'bugs') return `Prioritize bug fixing and crash stabilization (${pain.count} mentions).`;
    if (pain.name === 'performance') return `Improve optimization (stutter/fps stability) (${pain.count} mentions).`;
    if (pain.name === 'online') return `Improve servers, matchmaking reliability, and anti-cheat (${pain.count} mentions).`;
    if (pain.name === 'content') return `Add variety or reduce repetitive/grindy sections (${pain.count} mentions).`;
    if (pain.name === 'monetization') return `Revisit pricing/monetization perception (${pain.count} mentions).`;
    return `Address ${pain.name} concerns (${pain.count} mentions).`;
  });

  const phraseNudges = negativePhrases.slice(0, 3).map((p) => `Investigate recurring term "${p.phrase}" (${p.count} reviews).`);
  return [...actions, ...phraseNudges].slice(0, 8);
}

export function summarizeReviews(reviews, query) {
  const total = reviews.length;
  const positiveReviews = reviews.filter((r) => r.voted_up);
  const negativeReviews = reviews.filter((r) => !r.voted_up);
  const positiveCount = positiveReviews.length;
  const negativeCount = negativeReviews.length;
  const positiveRatio = total ? positiveCount / total : 0;
  const sentimentScore = Number(((positiveRatio * 2 - 1) * 100).toFixed(2));

  const positiveThemeHits = countThemeHits(positiveReviews, positiveThemes);
  const negativeThemeHits = countThemeHits(negativeReviews, negativeThemes);

  const strengths = topEntries(positiveThemeHits, 5);
  const painPoints = topEntries(negativeThemeHits, 6);

  const positiveKeyPhrases = extractKeyPhrases(positiveReviews, 10);
  const negativeKeyPhrases = extractKeyPhrases(negativeReviews, 10);

  const summary = {
    label:
      sentimentScore >= 60 ? 'Very Positive' :
      sentimentScore >= 25 ? 'Mostly Positive' :
      sentimentScore > -25 ? 'Mixed' :
      sentimentScore > -60 ? 'Mostly Negative' :
      'Very Negative',
    highlights: strengths.map((s) => `${s.name} (${s.count})`),
    improvements: painPoints.map((p) => `${p.name} (${p.count})`),
  };

  return {
    query,
    sentimentScore,
    totalReviewsAnalyzed: total,
    positiveCount,
    negativeCount,
    positivePercent: Number((positiveRatio * 100).toFixed(2)),
    strengths,
    painPoints,
    recurringFeedback: {
      positiveThemes: strengths,
      negativeThemes: painPoints,
      positiveKeyPhrases,
      negativeKeyPhrases,
    },
    representativeQuotes: {
      positive: pickRepresentativeQuotes(positiveReviews, 3),
      negative: pickRepresentativeQuotes(negativeReviews, 3),
    },
    actionableRecommendations: toImprovementActions(painPoints, negativeKeyPhrases),
    summary,
  };
}

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed request (${res.status}) ${url}`);
  return res.json();
}

export async function searchGame(query) {
  const url = `${STEAM_STORE_API}/api/storesearch/?term=${encodeURIComponent(query)}&l=english&cc=us`;
  const data = await fetchJson(url);
  const items = data?.items || [];
  if (!items.length) return null;

  const first = items[0];
  return {
    appId: first.id,
    name: first.name,
    tinyImage: first.tiny_image || null,
    price: first.price ? first.price.final_formatted : (first.is_free ? 'Free' : 'N/A'),
  };
}

export async function discoverGamesForBackgroundCrawl() {
  try {
    const all = await fetchJson(`${STEAMSPY_API}?request=all`);
    return Object.values(all).map((entry) => ({ appId: Number(entry.appid), name: entry.name || `App ${entry.appid}` }));
  } catch {
    const top = await fetchJson(`${STEAMSPY_API}?request=top100in2weeks`);
    return Object.values(top).map((entry) => ({ appId: Number(entry.appid), name: entry.name || `App ${entry.appid}` }));
  }
}

export async function fetchAllReviews(appId, options = {}) {
  const limitReviews = Number(options.limitReviews || 0);
  const hardCap = limitReviews > 0 ? Math.min(limitReviews, HARD_MAX_REVIEWS) : HARD_MAX_REVIEWS;

  let cursor = '*';
  let totalReported = null;
  let pagesFetched = 0;
  const reviews = [];

  for (let page = 0; page < HARD_MAX_PAGES; page += 1) {
    const url = `${STEAM_STORE_API}/appreviews/${appId}?json=1&language=english&purchase_type=all&filter=all&num_per_page=${REVIEWS_PER_PAGE}&cursor=${encodeURIComponent(cursor)}`;
    const payload = await fetchJson(url);
    const pageReviews = payload?.reviews || [];
    pagesFetched += 1;

    if (totalReported === null) {
      totalReported = Number(payload?.query_summary?.total_reviews || 0) || null;
    }

    if (!pageReviews.length) break;

    reviews.push(...pageReviews.map((r) => ({
      review: r.review || '',
      voted_up: Boolean(r.voted_up),
      votes_up: Number(r.votes_up || 0),
      weighted_vote_score: Number(r.weighted_vote_score || 0),
      author: {
        playtime_at_review: Number(r.author?.playtime_at_review || 0),
      },
    })));

    if (reviews.length >= hardCap) {
      return {
        reviews: reviews.slice(0, hardCap),
        stats: {
          pagesFetched,
          capped: true,
          hardCap,
          totalReported,
        },
      };
    }

    if (totalReported && reviews.length >= totalReported) break;
    if (!payload.cursor || payload.cursor === cursor) break;
    cursor = payload.cursor;
  }

  return {
    reviews,
    stats: {
      pagesFetched,
      capped: false,
      hardCap,
      totalReported,
    },
  };
}

export async function analyzeGameSentimentByAppId(appId, name = `App ${appId}`, options = {}) {
  const { reviews, stats } = await fetchAllReviews(appId, options);
  if (!reviews.length) {
    throw new Error('No reviews available for this game.');
  }

  const coveragePercent = stats.totalReported
    ? Number(((reviews.length / stats.totalReported) * 100).toFixed(2))
    : null;

  return {
    source: 'steam-live',
    game: {
      appId,
      name,
      tinyImage: null,
      price: 'N/A',
    },
    crawl: {
      comprehensive: !stats.capped && (!stats.totalReported || reviews.length >= stats.totalReported),
      pagesFetched: stats.pagesFetched,
      reviewsCollected: reviews.length,
      hardCap: stats.hardCap,
      totalReportedBySteam: stats.totalReported,
      coveragePercent,
    },
    analysis: summarizeReviews(reviews, name),
  };
}

export async function analyzeGameSentiment(query, options = {}) {
  if (!query || query.trim().length < 2) {
    throw new Error('Please enter at least 2 characters.');
  }

  const allowFallback = options.allowFallback !== false;

  try {
    const game = await searchGame(query);
    if (!game) throw new Error('Game not found.');

    const data = await analyzeGameSentimentByAppId(game.appId, game.name, options);
    return {
      ...data,
      game: {
        ...data.game,
        tinyImage: game.tinyImage,
        price: game.price,
      },
    };
  } catch (error) {
    if (!allowFallback) throw error;

    return {
      source: 'fallback',
      fallbackReason: error.message,
      game: {
        appId: 0,
        name: `${query} (fallback sample)`,
        tinyImage: null,
        price: 'N/A',
      },
      crawl: {
        comprehensive: false,
        pagesFetched: 0,
        reviewsCollected: fallbackReviews.length,
        hardCap: HARD_MAX_REVIEWS,
        totalReportedBySteam: null,
        coveragePercent: null,
      },
      analysis: summarizeReviews(fallbackReviews, query),
    };
  }
}
