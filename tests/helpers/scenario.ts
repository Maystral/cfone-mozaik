import { readFileSync } from "node:fs"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any
export const golden: Json = JSON.parse(readFileSync(new URL("../../data/scenario/golden.json", import.meta.url), "utf8"))
export const scenario: Json = JSON.parse(readFileSync(new URL("../../data/scenario/household.scenario.json", import.meta.url), "utf8"))
