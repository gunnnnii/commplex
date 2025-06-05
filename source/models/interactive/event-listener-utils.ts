export function normalizeOptions(
	options?: AddEventListenerOptions | boolean
): AddEventListenerOptions | undefined {
	if (typeof options === "boolean") {
		return { capture: options };
	}

	return options;
}

export function getSignalFromOptions(
	options?: AddEventListenerOptions | boolean
): AbortSignal | undefined {
	if (typeof options === "boolean") {
		return undefined;
	}

	return options?.signal;
}

export function anyMaybeSignals(
	signals: (AbortSignal | undefined)[]
): AbortSignal {
	return AbortSignal.any(signals.filter(Boolean) as AbortSignal[]);
}
