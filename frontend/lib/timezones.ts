// lib/timezones.ts — curated IANA timezone list + zoned-time conversion helper

export const COMMON_TIMEZONES = [
  "UTC",
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Hong_Kong",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Karachi",
  "Asia/Dhaka",
  "Asia/Jakarta",
  "Asia/Riyadh",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Moscow",
  "Africa/Cairo",
  "Africa/Johannesburg",
  "Africa/Lagos",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Sao_Paulo",
  "America/Mexico_City",
  "Australia/Sydney",
  "Australia/Perth",
  "Pacific/Auckland",
];

export function detectBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Converts a `datetime-local` input value (e.g. "2026-07-20T14:30"), meant
 * to represent wall-clock time IN `timeZone`, into a correct UTC ISO string.
 * Plain `new Date(localString)` always assumes the browser's own timezone,
 * which is wrong when the user picks a different zone than their device. */
export function zonedDateTimeToUtcISOString(dateTimeLocal: string, timeZone: string): string {
  const [datePart, timePart] = dateTimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart || "00:00").split(":").map(Number);

  // Start with a UTC guess using the raw numbers the user typed.
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));

  // Ask Intl how that instant reads as wall-clock time in `timeZone`, using
  // formatToParts so we get plain numbers back — never round-trip through
  // `new Date(someString)`, since that parses using the *runtime's* local
  // timezone (the user's browser), not UTC, which silently corrupts the
  // offset calculation whenever the browser isn't itself set to UTC.
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(utcGuess).reduce<Record<string, string>>((acc, p) => {
    if (p.type !== "literal") acc[p.type] = p.value;
    return acc;
  }, {});

  const asUTC = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  const offset = asUTC - utcGuess.getTime();
  return new Date(utcGuess.getTime() - offset).toISOString();
}

export function formatInTimezone(isoString: string, timeZone: string): string {
  try {
    return new Date(isoString).toLocaleString("en-US", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return new Date(isoString).toLocaleString();
  }
}
