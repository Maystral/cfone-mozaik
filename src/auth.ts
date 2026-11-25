// Accounts for the demo page: scrypt-hashed passwords in a JSON file, opaque session tokens in memory.
// Node built-ins only. The household data is synthetic and shared; accounts only gate the page.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs"
import { dirname } from "node:path"

interface StoredUser { username: string; salt: string; hash: string; createdAt: string }

export const USERNAME = /^[a-z0-9_.-]{3,32}$/
export const MIN_PASSWORD = 4

export class UserStore {
	private users = new Map<string, StoredUser>()
	constructor(private readonly file: string) {
		if (existsSync(file)) for (const u of (JSON.parse(readFileSync(file, "utf8")) as { users: StoredUser[] }).users) this.users.set(u.username, u)
	}
	private save(): void {
		mkdirSync(dirname(this.file), { recursive: true })
		const tmp = `${this.file}.tmp`
		writeFileSync(tmp, JSON.stringify({ users: [...this.users.values()] }, null, 1), { mode: 0o600 })
		renameSync(tmp, this.file)
	}
	private static hash(password: string, salt: string): string {
		return scryptSync(password, salt, 64).toString("hex")
	}
	/** Creates the user if missing; never overwrites an existing password. */
	ensure(username: string, password: string): void {
		if (!this.users.has(username.toLowerCase())) this.register(username, password)
	}
	register(username: string, password: string): { ok: true } | { ok: false; error: string } {
		const name = String(username ?? "").trim().toLowerCase()
		if (!USERNAME.test(name)) return { ok: false, error: "Username: 3 to 32 letters, digits, dot, dash or underscore." }
		if (typeof password !== "string" || password.length < MIN_PASSWORD || password.length > 200) return { ok: false, error: `Password: at least ${MIN_PASSWORD} characters.` }
		if (this.users.has(name)) return { ok: false, error: "That username is taken." }
		const salt = randomBytes(16).toString("hex")
		this.users.set(name, { username: name, salt, hash: UserStore.hash(password, salt), createdAt: new Date().toISOString() })
		this.save()
		return { ok: true }
	}
	verify(username: string, password: string): boolean {
		const u = this.users.get(String(username ?? "").trim().toLowerCase())
		if (!u || typeof password !== "string") return false
		const a = Buffer.from(UserStore.hash(password, u.salt), "hex"), b = Buffer.from(u.hash, "hex")
		return a.length === b.length && timingSafeEqual(a, b)
	}
}

export class Sessions {
	private readonly map = new Map<string, { username: string; expires: number }>()
	constructor(readonly ttlMs = 7 * 24 * 3600 * 1000) {}
	create(username: string, now = Date.now()): string {
		const token = randomBytes(32).toString("base64url")
		this.map.set(token, { username, expires: now + this.ttlMs })
		return token
	}
	user(token: string | undefined): string | undefined {
		if (!token) return undefined
		const s = this.map.get(token)
		if (!s) return undefined
		if (s.expires < Date.now()) { this.map.delete(token); return undefined }
		return s.username
	}
	end(token: string | undefined): void { if (token) this.map.delete(token) }
}

/** A small fixed-window limiter for login and registration attempts. */
export class RateLimit {
	private readonly hits = new Map<string, { n: number; until: number }>()
	constructor(private readonly max = 10, private readonly windowMs = 60_000) {}
	allow(key: string, now = Date.now()): boolean {
		const h = this.hits.get(key)
		if (!h || h.until < now) { this.hits.set(key, { n: 1, until: now + this.windowMs }); return true }
		h.n++
		return h.n <= this.max
	}
}

export function cookieValue(header: string | undefined, name: string): string | undefined {
	for (const part of (header ?? "").split(";")) {
		const [k, ...v] = part.trim().split("=")
		if (k === name) return decodeURIComponent(v.join("="))
	}
	return undefined
}
