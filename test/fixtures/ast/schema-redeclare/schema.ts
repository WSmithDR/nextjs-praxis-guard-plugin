declare const z: { object: (shape: Record<string, unknown>) => unknown; string: () => unknown; number: () => unknown; };
import 'zod';

export const UserSchema = z.object({ id: z.string(), name: z.string() });

export interface User { id: string; name: string; }
