import { test } from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { UserStore, Sessions } from "../src/auth.ts"

test("the demo user is seeded and passwords are hashed", () => {
	const dir = mkdtempSync(join(tmpdir(), "cfone-users-"))
	const users = new UserStore(join(dir, "users.json"))
	users.ensure("demo", "demo")
	assert.equal(users.verify("demo", "demo"), true)
	assert.equal(users.verify("demo", "wrong"), false)
	assert.equal(users.verify("nobody", "demo"), false)
	const raw = readFileSync(join(dir, "users.json"), "utf8")
	assert.ok(!raw.includes("\"demo\",\"password\"") && !/"password"/.test(raw))
	users.ensure("demo", "other")
	assert.equal(users.verify("demo", "demo"), true, "ensure does not overwrite")
})

test("registration validates and persists", () => {
	const dir = mkdtempSync(join(tmpdir(), "cfone-users-"))
	const users = new UserStore(join(dir, "users.json"))
	assert.deepEqual(users.register("mila", "secret1"), { ok: true })
	assert.equal(users.register("mila", "secret2").ok, false)
	assert.equal(users.register("Mila", "secret2").ok, false, "usernames are case-insensitive")
	assert.equal(users.register("a", "secret2").ok, false)
	assert.equal(users.register("luka", "abc").ok, false)
	assert.equal(new UserStore(join(dir, "users.json")).verify("MILA", "secret1"), true)
})

test("sessions expire and can be ended", () => {
	const s = new Sessions(50)
	const t = s.create("demo")
	assert.equal(s.user(t), "demo")
	assert.equal(s.user("nope"), undefined)
	s.end(t)
	assert.equal(s.user(t), undefined)
	const old = s.create("demo", Date.now() - 100)
	assert.equal(s.user(old), undefined)
})
