import test from 'node:test';
import assert from 'node:assert/strict';
import {
  profileRows,
  computeCorrelationFromRows,
  computeHistogramBins,
  computeQualityScore,
  generateDataInsights,
  proposePlanFromPrompt,
  applyPlanToRows,
  formatRelativeTime,
  getTimeOfDayGreeting,
} from './localAnalytics';

const SAMPLE_ROWS = [
  { id: 'c1', tenure: 12, charges: 50, plan: 'Monthly', churn: 1 },
  { id: 'c2', tenure: 24, charges: 70, plan: 'Annual', churn: 0 },
  { id: 'c3', tenure: 36, charges: null, plan: 'Annual', churn: 0 },
  { id: 'c4', tenure: 48, charges: 90, plan: 'Two-Year', churn: 0 },
  { id: 'c5', tenure: 240, charges: 110, plan: 'Monthly', churn: 1 }, // outlier in tenure
  { id: 'c1', tenure: 12, charges: 50, plan: 'Monthly', churn: 1 }, // exact duplicate
];

test('profileRows computes exact missing rate on 0..100 scale (not 100x inflated)', () => {
  const summary = profileRows(SAMPLE_ROWS);
  assert.equal(summary.rowCount, 6);
  assert.equal(summary.columnCount, 5);
  assert.equal(summary.duplicateRowsCount, 1);
  // 1 missing cell out of 30 total cells = 3.33%
  assert.equal(summary.overallMissingRate, 3.33);
  const chargesCol = summary.columns.find((c) => c.columnName === 'charges');
  assert.ok(chargesCol);
  assert.equal(chargesCol.missingCount, 1);
  assert.equal(chargesCol.missingPercent, 16.67);
});

test('computeHistogramBins preserves true zero-count bins', () => {
  const bins = computeHistogramBins(SAMPLE_ROWS, 'tenure', 5);
  assert.equal(bins.length, 5);
  const totalCount = bins.reduce((sum, b) => sum + b.count, 0);
  assert.equal(totalCount, 6);
  assert.ok(bins.some((b) => b.count === 0));
});

test('computeCorrelationFromRows computes diagonal 1.0 and bounded Pearson r', () => {
  const corr = computeCorrelationFromRows(SAMPLE_ROWS, ['tenure', 'charges']);
  assert.equal(corr.matrix[0]?.[0], 1);
  assert.equal(corr.matrix[1]?.[1], 1);
  const r = corr.matrix[0]?.[1] ?? 0;
  assert.ok(r > 0.7 && r <= 1);
});

test('applyPlanToRows executes deduplicate, impute, and clip immutably', () => {
  const originalSnapshot = JSON.stringify(SAMPLE_ROWS);
  const result = applyPlanToRows(SAMPLE_ROWS, ['id', 'tenure', 'charges', 'plan', 'churn'], {
    title: 'Clean Sample',
    operations: [
      { type: 'deduplicate' },
      { type: 'impute', columns: ['charges'], strategy: 'median' },
      { type: 'outlier_treatment', columns: ['tenure'], strategy: 'clip_iqr', multiplier: 1.5 },
    ],
  });

  // Original data never mutated
  assert.equal(JSON.stringify(SAMPLE_ROWS), originalSnapshot);
  assert.equal(result.transformedRowCount, 5);
  assert.ok(result.rows.every((r) => r.charges !== null));
  const afterProfile = profileRows(result.rows, result.columns);
  assert.equal(afterProfile.duplicateRowsCount, 0);
  assert.equal(afterProfile.overallMissingRate, 0);
  assert.ok(computeQualityScore(afterProfile) > computeQualityScore(profileRows(SAMPLE_ROWS)));
});

test('generateDataInsights & proposePlanFromPrompt reflect real columns', () => {
  const summary = profileRows(SAMPLE_ROWS);
  const corr = computeCorrelationFromRows(SAMPLE_ROWS, ['tenure', 'charges']);
  const insights = generateDataInsights(summary, corr);
  assert.ok(insights.some((i) => i.column === 'charges'));
  assert.ok(insights.some((i) => i.actionType === 'deduplicate'));

  const proposal = proposePlanFromPrompt('Impute missing values and remove duplicates', summary);
  assert.ok(proposal.plan);
  assert.ok(proposal.plan.operations.some((op) => op.type === 'deduplicate'));
  assert.ok(proposal.plan.operations.some((op) => op.type === 'impute'));
});

test('time helpers format relative times and greetings accurately', () => {
  const now = Date.parse('2026-11-20T12:00:00Z');
  assert.equal(formatRelativeTime('2026-11-20T11:59:45Z', now), 'Just now');
  assert.equal(formatRelativeTime('2026-11-20T10:00:00Z', now), '2h ago');
  assert.equal(formatRelativeTime('2026-11-18T12:00:00Z', now), '2d ago');
  assert.equal(getTimeOfDayGreeting(9), 'Good morning');
  assert.equal(getTimeOfDayGreeting(14), 'Good afternoon');
  assert.equal(getTimeOfDayGreeting(20), 'Good evening');
});
