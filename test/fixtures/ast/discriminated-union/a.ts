interface Circle { radius: number; }
interface Square { side: number; }
export type Shape = Circle | Square;

interface Dog { kind: 'dog'; bark: boolean; }
interface Cat { kind: 'cat'; meow: boolean; }
export type Animal = Dog | Cat;
