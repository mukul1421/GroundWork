import { describe, it, expect } from 'vitest';
import {
  extractPlanFromResponse,
  stripPlanFromResponse,
  describeOperation,
} from './preprocessingPlan';

describe('preprocessingPlan', () => {
  it('extracts plan from markdown code block correctly', () => {
    const aiText = `
Here is what I recommend for your dataset:

\`\`\`json:groundwork-plan
{
  "title": "Impute Age & Clean Outliers",
  "operations": [
    { "type": "impute", "columns": ["Age"], "strategy": "median" },
    { "type": "drop_columns", "columns": ["Cabin"] },
    { "type": "scale", "columns": ["Fare"], "strategy": "log1p" }
  ]
}
\`\`\`

Let me know if you approve this plan!
    `;

    const plan = extractPlanFromResponse(aiText);
    expect(plan).not.toBeNull();
    expect(plan?.title).toBe('Impute Age & Clean Outliers');
    expect(plan?.operations).toHaveLength(3);
    expect(plan?.operations[0]?.type).toBe('impute');

    const cleanText = stripPlanFromResponse(aiText);
    expect(cleanText).not.toContain('```json:groundwork-plan');
    expect(cleanText).toContain('Here is what I recommend');
  });

  it('describes operations in clear human terms', () => {
    expect(
      describeOperation({ type: 'impute', columns: ['Age'], strategy: 'median' }),
    ).toContain('Impute nulls in [Age] with median');

    expect(
      describeOperation({ type: 'drop_columns', columns: ['Cabin', 'Ticket'] }),
    ).toContain('Drop columns: [Cabin, Ticket]');

    expect(
      describeOperation({ type: 'scale', columns: ['Fare'], strategy: 'log1p' }),
    ).toContain('Scale [Fare] using LOG1P');
  });
});
