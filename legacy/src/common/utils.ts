export type ValueOf<T> = T[keyof T];
export type OverrideType<T, R> = Omit<T, keyof R> & R;
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & unknown;

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createId(): string {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 10; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
