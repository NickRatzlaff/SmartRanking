export interface Criterion {
  id: string;
  name: string;
  weight: number; // 0-100, normalized against other criteria when scoring
  higherIsBetter: boolean; // false for criteria like "difficulty" where lower values should score higher
}

export interface DescriptorField {
  id: string;
  name: string;
}

export interface RankedObject {
  id: string;
  fieldValues: Record<string, string>; // fieldId -> text value; fields()[0] is the primary label
  values: Record<string, number>; // criterionId -> value (1-10)
  notes: string;
}

export type ThemeName = 'default' | 'qhs';

export const MIN_VALUE = 1;
export const MAX_VALUE = 10;
export const DEFAULT_VALUE = 5;
