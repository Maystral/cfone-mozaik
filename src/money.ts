// Money is integer minor units. Parsed from printed text; never floating point.
import type { Minor } from "./types.ts"

const AMOUNT = /^(?:[A-Z]{3}\s+)?(-)?\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})(?:\s*(CR))?$/

/** Reads an amount exactly as printed: "3,200.00", "11,687.15 CR", "-12,000.00", "AED 8,362.80", "4311.74". */
export function parsePrinted(text: string): { minor: Minor; credit: boolean } {
	const m = AMOUNT.exec(text.trim())
	if (!m) throw new Error(`not a printed amount: "${text}"`)
	const minor = Number(m[2]!.replace(/,/g, "")) * 100 + Number(m[3])
	return { minor, credit: Boolean(m[1] || m[4]) }
}

export function isPrintedAmount(text: string): boolean {
	return AMOUNT.test(text.trim())
}

export function formatMoney(minor: Minor, currency?: string): string {
	const neg = minor < 0
	const abs = Math.abs(minor)
	const units = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")
	const s = `${neg ? "-" : ""}${units}.${String(abs % 100).padStart(2, "0")}`
	return currency ? `${currency} ${s}` : s
}

/** Splits a decimal string into a scaled integer: "3.25" -> [325n, 100n]. */
function decimal(s: string): [bigint, bigint] {
	const m = /^(\d+)(?:\.(\d+))?$/.exec(s.trim())
	if (!m) throw new Error(`not a decimal: "${s}"`)
	const frac = m[2] ?? ""
	return [BigInt(m[1]! + frac), 10n ** BigInt(frac.length)]
}

function divHalfUp(n: bigint, d: bigint): bigint {
	const neg = n < 0n
	const a = neg ? -n : n
	const q = (a * 2n + d) / (2n * d)
	return neg ? -q : q
}

function divUp(n: bigint, d: bigint): bigint {
	if (n <= 0n) return -((-n) / d)
	return (n + d - 1n) / d
}

/** pct% of an amount, rounded half up. */
export function pctOf(minor: Minor, pct: string): Minor {
	const [num, scale] = decimal(pct)
	return Number(divHalfUp(BigInt(minor) * num, scale * 100n))
}

/** Converts minor units at a 4-decimal rate (base -> quote), rounded half up. */
export function convert(minor: Minor, rate: string): Minor {
	const [num, scale] = decimal(rate)
	return Number(divHalfUp(BigInt(minor) * num, scale))
}

/** The base-currency amount needed to obtain homeMinor in the quote currency, rounded up. */
export function neededIn(homeMinor: Minor, rate: string): Minor {
	const [num, scale] = decimal(rate)
	if (num === 0n) throw new Error("zero rate")
	return Number(divUp(BigInt(homeMinor) * scale, num))
}
