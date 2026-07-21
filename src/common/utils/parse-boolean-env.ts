export const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
