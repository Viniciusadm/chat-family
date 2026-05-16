export type LocalTimestamp = {
  toMillis: () => number;
};

export function timestampFromMillis(ms: number): LocalTimestamp {
  return {
    toMillis: () => ms,
  };
}

export function timestampFromIso(value: string | null | undefined): LocalTimestamp | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (!Number.isFinite(ms)) return null;
  return timestampFromMillis(ms);
}
