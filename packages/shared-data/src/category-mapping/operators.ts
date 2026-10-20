export const stringOperators = ["contains", "equals", "startsWith", "endsWith"] as const;

export const numericOperators = ["equals", "greaterThan", "lessThan"] as const;

export const allOperators = [...stringOperators, ...numericOperators] as const;

export type StringOperator = (typeof stringOperators)[number];
export type NumericOperator = (typeof numericOperators)[number];
export type Operator = (typeof allOperators)[number];
