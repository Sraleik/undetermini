export type ValueOf<T> = T[keyof T];
export type OverrideType<T, R> = Omit<T, keyof R> & R;
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & unknown;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
