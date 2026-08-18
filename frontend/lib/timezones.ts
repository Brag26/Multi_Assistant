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
 *
 * Previous implementation used `new Date(localeString)` to help compute the
 * offset — that parses using whatever timezone the CURRENT MACHINE/BROWSER
 * is set to, which leaked the browser's own offset into the result. It only
 * produced correct output when the browser happened to already be in UTC;
 * for any other browser timezone the result was wrong by that browser's
 * own offset (and silently produced NO shift at all whenever the browser's
 * timezone matched the one being picked — which looks exactly like "the
 * timezone picker doesn't do anything"). Fixed by computing the offset
 * entirely via Intl.DateTimeFormat with an explicit `timeZone` — no step
 * anywhere in this version depends on the machine's own local timezone. */
export function zonedDateTimeToUtcISOString(dateTimeLocal: string, timeZone: string): string {
  const [datePart, timePart] = dateTimeLocal.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = (timePart || "00:00").split(":").map(Number);

  // Reference instant: treat the requested date/time as if it were UTC.
  const asUTC = Date.UTC(year, month - 1, day, hour, minute);

  // What wall-clock time does that instant actually show in `timeZone`?
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(asUTC));
  const get = (type: string) => parseInt(parts.find((p) => p.type === type)?.value || "0", 10);
  // Some Intl implementations report midnight as hour "24" instead of "00".
  const hourPart = get("hour") % 24;
  const shownAsUTC = Date.UTC(get("year"), get("month") - 1, get("day"), hourPart, get("minute"), get("second"));

  // The gap between what we asked for and what it shows in `timeZone` IS
  // that zone's real UTC offset at this moment (handles DST correctly,
  // since we asked Intl to resolve it for this specific date) — and
  // nothing here ever touched the machine's own timezone.
  const offsetMs = shownAsUTC - asUTC;
  return new Date(asUTC - offsetMs).toISOString();
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
