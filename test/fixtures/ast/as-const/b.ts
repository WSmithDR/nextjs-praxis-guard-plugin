export const STATES = ['on', 'off'] as const;
export type State = typeof STATES[number];
