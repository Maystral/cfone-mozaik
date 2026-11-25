let quieted = false

/** Mozaik 4.2 prints "mozaik cloud: no API key ..." once per loop; show it once per process. */
export function quietCloudWarning(): void {
	if (quieted) return
	quieted = true
	const orig = console.warn.bind(console)
	let shown = false
	console.warn = (...args: unknown[]) => {
		const first = args[0]
		if (typeof first === "string" && first.startsWith("mozaik cloud: no API key")) {
			if (shown) return
			shown = true
		}
		orig(...args)
	}
}

/** Keeps the process alive on stray rejections from loops (runLoop does not catch). */
export function installCrashGuard(onError: (e: unknown) => void): void {
	process.on("unhandledRejection", (e) => onError(e))
	process.on("uncaughtException", (e) => onError(e))
}
