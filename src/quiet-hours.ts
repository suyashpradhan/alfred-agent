/** Explicit host policy; no environment timezone, clock, persistence or network. */
export type QuietHoursPolicy = { timeZone: string; start: string; end: string };
function invalid(): never { throw new Error('INVALID_POLICY'); }
export function quietAt(value: unknown, now: number): boolean {
  try {
    if (!Number.isSafeInteger(now) || now < 0 || now > 8_640_000_000_000_000) invalid();
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) invalid();
    const keys = Reflect.ownKeys(value);
    if (keys.length !== 3 || !['timeZone', 'start', 'end'].every(k => keys.includes(k))) invalid();
    const read = (key: string): string => {
      const d = Object.getOwnPropertyDescriptor(value, key);
      if (!d || !Object.hasOwn(d, 'value') || typeof d.value !== 'string') invalid();
      return d.value;
    };
    const zone = read('timeZone'), start = read('start'), end = read('end');
    // Named zones (including UTC); never accept fixed-offset syntax or whitespace.
    if (zone.length > 100 || !/^[A-Za-z_]+(?:\/[A-Za-z0-9_+\-]+)*$/.test(zone)) invalid();
    const minute = (s: string) => {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(s)) invalid();
      return Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    };
    const from = minute(start), until = minute(end);
    // Equal endpoints are ambiguous (disabled versus all-day); reject.
    if (from === until) invalid();
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone, hourCycle: 'h23', hour: '2-digit', minute: '2-digit',
      numberingSystem: 'latn',
    }).formatToParts(now);
    const local = Number(parts.find(p => p.type === 'hour')?.value) * 60 +
      Number(parts.find(p => p.type === 'minute')?.value);
    if (!Number.isInteger(local) || local < 0 || local >= 1440) invalid();
    return from < until ? local >= from && local < until : local >= from || local < until;
  } catch { return invalid(); }
}
