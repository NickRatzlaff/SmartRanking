export interface Criterion {
  id: string;
  name: string;
  weight: number; // 0-100, normalized against other criteria when scoring
}

export interface RankedObject {
  id: string;
  name: string;
  values: Record<string, number>; // criterionId -> value (1-10)
}

export const MIN_VALUE = 1;
export const MAX_VALUE = 10;
export const DEFAULT_VALUE = 5;
