import { test } from "node:test"
import assert from "node:assert/strict"
import { defineRuntime, supportedModels } from "@mozaik-ai/core"

test("pinned Mozaik 4.2 runtime API is present", () => {
	assert.equal(typeof defineRuntime, "function")
	assert.ok(supportedModels.some((m) => m.specification.name === "claude-sonnet-5-5"))
})
