function partsAt(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(instant));
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

/** Convert a datetime-local value interpreted in an IANA timezone into UTC. */
export function zonedLocalDateTimeToIso(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) throw new Error("Invalid local date and time.");
  const [, year, month, day, hour, minute, second = "00"] = match;
  const desiredWallClock = Date.UTC(+year, +month - 1, +day, +hour, +minute, +second);
  let candidate = desiredWallClock;

  // Re-evaluate once after applying the initial offset so DST transitions use
  // the offset at the target instant rather than at the first approximation.
  for (let iteration = 0; iteration < 2; iteration++) {
    const projected = partsAt(candidate, timeZone);
    const projectedWallClock = Date.UTC(
      Number(projected.year),
      Number(projected.month) - 1,
      Number(projected.day),
      Number(projected.hour),
      Number(projected.minute),
      Number(projected.second),
    );
    candidate += desiredWallClock - projectedWallClock;
  }

  return new Date(candidate).toISOString();
}
