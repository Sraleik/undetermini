/** Move a list cursor by delta, wrapping between first and last. */
export const cycleListIndex = (
  current: number,
  delta: 1 | -1,
  length: number,
): number => {
  if (length <= 0) return 0;
  return (current + delta + length) % length;
};
