// Dates are ISO YYYY-MM-DD strings. Day arithmetic in UTC.
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"]
export const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export function isIsoDate(s: string): boolean {
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
	if (!m) return false
	const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])))
	return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3])
}

/** Printed date ("31/10/2026", "1 Oct 2026", "2026-10-31") to ISO, or undefined. */
export function isoFromPrinted(text: string): string | undefined {
	const t = text.trim()
	let y: number, mo: number, d: number
	let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t)
	if (m) { y = +m[1]!; mo = +m[2]!; d = +m[3]! }
	else if ((m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t))) { d = +m[1]!; mo = +m[2]!; y = +m[3]! }
	else if ((m = /^(\d{1,2}) ([A-Za-z]{3})[a-z]* (\d{4})$/.exec(t))) { d = +m[1]!; mo = MONTHS.indexOf(m[2]!.toLowerCase()) + 1; y = +m[3]! }
	else return undefined
	const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`
	return isIsoDate(iso) ? iso : undefined
}

export function addDays(iso: string, n: number): string {
	const d = new Date(`${iso}T00:00:00Z`)
	d.setUTCDate(d.getUTCDate() + n)
	return d.toISOString().slice(0, 10)
}

export function daysInMonth(y: number, m: number): number {
	return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** The given day of a month, clamped to the month's last day. */
export function dayIn(y: number, m: number, day: number): string {
	return `${y}-${String(m).padStart(2, "0")}-${String(Math.min(day, daysInMonth(y, m))).padStart(2, "0")}`
}

export function dayOf(iso: string): number { return Number(iso.slice(8, 10)) }

/** "21 Nov 2026" */
export function humanDate(iso: string): string {
	return `${Number(iso.slice(8, 10))} ${MONTH_NAMES[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`
}
