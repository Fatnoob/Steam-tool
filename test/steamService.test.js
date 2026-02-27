import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateEmergingScore, calculatePopularityScore } from '../src/steamService.js';

test('calculatePopularityScore rewards higher ccu and followers', () => {
  const lower = calculatePopularityScore({
    ccu: 1000,
    followers: 5000,
    wishlistSignal: 8000,
    releaseDate: new Date(),
  });

  const higher = calculatePopularityScore({
    ccu: 20000,
    followers: 80000,
    wishlistSignal: 8000,
    releaseDate: new Date(),
  });

  assert.ok(higher > lower);
});

test('calculateEmergingScore heavily prefers newer releases when momentum is comparable', () => {
  const newer = calculateEmergingScore({
    ccu: 14000,
    followers: 50000,
    wishlistSignal: 90000,
    releaseDate: new Date(),
  });

  const older = calculateEmergingScore({
    ccu: 14000,
    followers: 50000,
    wishlistSignal: 90000,
    releaseDate: new Date('2018-01-01'),
  });

  assert.ok(newer > older);
});

test('calculateEmergingScore boosts coming soon / upcoming games', () => {
  const standard = calculateEmergingScore({
    ccu: 4000,
    followers: 30000,
    wishlistSignal: 60000,
    releaseDate: new Date(),
    comingSoon: false,
    sourceFlags: {},
    categories: [],
  });

  const upcoming = calculateEmergingScore({
    ccu: 4000,
    followers: 30000,
    wishlistSignal: 60000,
    releaseDate: null,
    comingSoon: true,
    sourceFlags: { fromComingSoon: true, fromUpcomingList: true },
    categories: ['Early Access'],
  });

  assert.ok(upcoming > standard);
});
