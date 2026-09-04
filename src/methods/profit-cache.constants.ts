// Dynamic variants derive their hourly IO from actions and cycles. Keep their
// cache separate from the fixed-only writer used by older deployments so a
// rolling deployment cannot overwrite calculated profits with zeroes.
export const METHODS_PROFITS_HASH_KEY = 'methods:profits:v2';
