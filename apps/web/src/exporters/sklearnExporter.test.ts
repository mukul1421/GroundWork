import { describe, it, expect } from 'vitest';
import { generateSklearnPipelineCode } from './sklearnExporter';

describe('sklearnExporter', () => {
  it('generates valid scikit-learn Python code matching features', () => {
    const code = generateSklearnPipelineCode({
      datasetName: 'Titanic',
      versionNumber: 2,
      profile: {
        rowCount: 891,
        columnCount: 11,
        duplicateRowsCount: 0,
        constantColumnsCount: 0,
        overallMissingRate: 0,
        columns: [
          {
            columnName: 'Survived',
            inferredType: 'BIGINT',
            isNumeric: true,
            nullable: false,
            missingCount: 0,
            missingPercent: 0,
            distinctCount: 2,
            uniquenessPercent: 0.22,
            isConstant: false,
            isPrimaryKeyCandidate: false,
            stats: {
              min: 0,
              max: 1,
              mean: 0.38,
              stddev: 0.48,
              median: 0,
              q25: 0,
              q75: 1,
              iqr: 1,
              outlierCount: 0,
            },
          },
          {
            columnName: 'Age',
            inferredType: 'DOUBLE',
            isNumeric: true,
            nullable: false,
            missingCount: 0,
            missingPercent: 0,
            distinctCount: 88,
            uniquenessPercent: 9.8,
            isConstant: false,
            isPrimaryKeyCandidate: false,
            stats: {
              min: 0.42,
              max: 80,
              mean: 29.36,
              stddev: 13.01,
              median: 28,
              q25: 22,
              q75: 35,
              iqr: 13,
              outlierCount: 11,
            },
          },
          {
            columnName: 'Sex',
            inferredType: 'VARCHAR',
            isNumeric: false,
            nullable: false,
            missingCount: 0,
            missingPercent: 0,
            distinctCount: 2,
            uniquenessPercent: 0.22,
            isConstant: false,
            isPrimaryKeyCandidate: false,
            stats: {
              topFrequencies: [
                { value: 'male', count: 577, percent: 64.76 },
                { value: 'female', count: 314, percent: 35.24 },
              ],
            },
          },
        ],
      },
      targetColumn: 'Survived',
    });

    expect(code).toContain('from sklearn.compose import ColumnTransformer');
    expect(code).toContain('from sklearn.pipeline import Pipeline');
    expect(code).toContain('train_test_split');
    expect(code).toContain('target = "Survived"');
    expect(code).toContain('numeric_features = [c for c in ["Age"] if c in X_train.columns]');
    expect(code).toContain('categorical_features = [c for c in ["Sex"] if c in X_train.columns]');
    expect(code).toContain('rf_pipeline.fit(X_train, y_train)');
    expect(code).not.toContain('customerID');
  });
});
