export const METHOD_CATEGORY_VALUES = ['skilling', 'collecting', 'combat', 'processing'] as const;

export type MethodCategoryValue = (typeof METHOD_CATEGORY_VALUES)[number];
