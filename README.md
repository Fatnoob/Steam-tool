# Steam Daily Trending SaaS

A lightweight SaaS-style dashboard with two Steam discovery feeds:

- **Most Popular Now**: dominant titles by active players and follows
- **Early Breakout Radar**: up-and-coming games that are hot for their age, follower size, and discovery context

## Run locally

```bash
npm start
```

Open `http://localhost:3000`.

## Data sources used

The radar now combines multiple Steam signals:

- SteamSpy `top100in2weeks`
- SteamSpy `hot100`
- Steam Store `featuredcategories` (`new_releases` + `coming_soon`)
- Steam app details (`appdetails`) for release date, categories, and metadata

## Ranking logic

### Most Popular score

`0.50*log10(ccu+1) + 0.33*log10(followers+1) + 0.13*log10(wishlistSignal+1) + 0.04*freshness`

### Early Breakout score

- **Core factors**
  - Freshness (`1/sqrt(daysOld)`)
  - Momentum vs followers (`ccu / followers` style conversion)
  - Momentum vs age (`ccu / daysOld` style growth pressure)
  - Interest (`followers + wishlist proxy`)
- **Bonuses**
  - Coming soon / upcoming list
  - New release feed
  - Hot list presence
  - Early Access category
- **Penalty**
  - Giant-incumbent penalty to keep the breakout list focused on up-and-coming titles

## API

- `GET /api/trending` – cached snapshot for today (or generated if absent)
- `GET /api/trending?refresh=1` – force refresh

Response fields include:
- `mostPopular`
- `emergingHits`
- `algorithm` (text summary of weights and data sources)
