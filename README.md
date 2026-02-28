# Steam Sentiment Analyzer

A lightweight tool for developers to analyze Steam review sentiment for any game.

## Why you may only see 6 reviews in preview

If live Steam API calls fail (network, rate-limit, or upstream errors), the app intentionally falls back to a 6-review sample set.
This keeps the UI usable, but it is **not** comprehensive.

Use strict mode to verify live crawl status:

- `GET /api/sentiment?q=<game>&strict=1`

In strict mode, the endpoint returns an error instead of fallback data.

## Background crawler + local database (new)

The app now includes a background crawler that scans many Steam games and stores analysis snapshots in a local JSON database:

- Database file: `data/db/reviews-db.json`
- Each record stores: `appId`, `name`, crawl coverage metadata, and sentiment analysis output.
- Crawler is resumable by rerunning it; newest snapshot overwrites prior record for a game.

### Crawler endpoints

- `POST /api/crawler/start` — start background crawl job
- `GET /api/crawler/status` — current crawler status
- `GET /api/crawler/games?limit=50` — recent stored game analyses

### Crawler controls

- `BG_CRAWLER_MAX_GAMES` (default `500`)
- `BG_CRAWLER_MAX_REVIEWS_PER_GAME` (default `5000`)
- `STEAM_REVIEW_MAX_PAGES` (default `1500`)
- `STEAM_REVIEW_MAX_REVIEWS` (default `100000`)

## What it does

1. You type a game name.
2. The app finds the game through Steam Store search API.
3. It crawls Steam `appreviews` pages via cursor pagination with `filter=all`.
4. It computes:
   - Total sentiment score
   - Positive vs negative split
   - Strength and pain-point themes
   - Recurring key phrases
   - Actionable recommendations
   - Representative high-signal quotes

## Comprehensive review crawling

- Uses Steam cursor pagination until one of these conditions:
  - all reviews reported by Steam are collected,
  - cursor stops advancing,
  - configured hard caps are reached.
- Response includes crawl diagnostics:
  - `reviewsCollected`
  - `totalReportedBySteam`
  - `coveragePercent`
  - `comprehensive`

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

## API

- `GET /api/sentiment?q=<game name>`
- Optional cap: `GET /api/sentiment?q=<game name>&maxReviews=5000`
- Strict live mode: `GET /api/sentiment?q=<game name>&strict=1`

## Notes

- Uses live Steam APIs when available.
- Falls back to sample review data only when live fetch fails (unless strict mode is enabled).
