import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeReviews } from '../src/steamService.js';

test('summarizeReviews computes sentiment score from vote ratio', () => {
  const reviews = [
    { review: 'great performance and fun gameplay', voted_up: true },
    { review: 'beautiful atmosphere and worth it', voted_up: true },
    { review: 'crash and bug issue', voted_up: false },
  ];

  const result = summarizeReviews(reviews, 'test game');

  assert.equal(result.totalReviewsAnalyzed, 3);
  assert.equal(result.positiveCount, 2);
  assert.equal(result.negativeCount, 1);
  assert.ok(result.sentimentScore > 0);
});

test('summarizeReviews outputs detailed recurring phrases and recommendations', () => {
  const reviews = [
    { review: 'smooth optimized gameplay and fun combat with beautiful visuals', voted_up: true, votes_up: 10 },
    { review: 'fun mechanics and good value for price, devs patch quickly', voted_up: true, votes_up: 6 },
    { review: 'lots of bug and crash issue plus lag and stutter', voted_up: false, votes_up: 12 },
    { review: 'server disconnect and cheater problem causes unplayable queue', voted_up: false, votes_up: 4 },
  ];

  const result = summarizeReviews(reviews, 'theme game');

  assert.ok(result.strengths.length > 0);
  assert.ok(result.painPoints.length > 0);
  assert.ok(result.recurringFeedback.negativeKeyPhrases.length > 0);
  assert.ok(result.actionableRecommendations.length > 0);
  assert.ok(result.representativeQuotes.negative.length > 0);
});
