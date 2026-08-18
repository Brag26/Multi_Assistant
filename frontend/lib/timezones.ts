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

  const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
  const tzString = utcGuess.toLocaleString("en-US", { timeZone });
  const tzDate = new Date(tzString);
  const diff = utcGuess.getTime() - tzDate.getTime();
  return new Date(utcGuess.getTime() + diff).toISOString();
}

/** Inverse of zonedDateTimeToUtcISOString — takes a UTC ISO timestamp (as
 * stored/returned by the backend) and produces a "YYYY-MM-DDTHH:mm" string
 * representing that instant's wall-clock time in `timeZone`, suitable for
 * populating a `datetime-local` input. Needed when editing an existing
 * scheduled campaign: without this, the picker showed the UTC time instead
 * of the time it was actually scheduled for, off by the zone's offset. */
export function utcIsoToZonedDateTimeLocal(isoString: string, timeZone: string): string {
  const date = new Date(isoString);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export function formatInTimezone(isoString: string, timeZone: string): string {  try {
    return new Date(isoString).toLocaleString("en-US", {
      timeZone,
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return new Date(isoString).toLocaleString();
  }
}
