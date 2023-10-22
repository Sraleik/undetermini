export type ValueOf<T> = T[keyof T];
export type OverrideType<T, R> = Omit<T, keyof R> & R;
