declare const z: { object: (shape: Record<string, unknown>) => any; string: () => any };
import 'zod';

export const FormSchema = z.object({ a: z.string(), b: z.string() }).partial();

export interface Form { a: string; b: string; }
