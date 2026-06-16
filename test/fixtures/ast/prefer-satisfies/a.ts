export interface Config { mode: string; retries: number; }

export const cfg: Config = { mode: 'prod', retries: 3 };

export const cfg2 = { mode: 'dev', retries: 1 } satisfies Config;

export const name: string = 'x';
