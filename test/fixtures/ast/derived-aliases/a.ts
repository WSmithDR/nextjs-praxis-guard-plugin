export interface Plain { id: string; name: string; }
export type Picked = Pick<Plain, 'id' | 'name'>;
declare const s: unknown;
export type Inferred = z.infer<typeof s>;
