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
	return AbortSignal.any(signals.filter(Boolean));
}

const captureListeners = new Map<
	EventListenerOrEventListenerObject,
	EventListenerOrEventListenerObject
>();
export function wrapCaptureListener(
	listener: EventListenerOrEventListenerObject | null,
	options: AddEventListenerOptions | boolean = false
) {
	if (listener == null) return null;

	if (typeof listener === "function") {
		const capture = normalizeOptions(options)?.capture;

		if (capture) {
			const wrappedCallback = (event: Event) => {
				if (event.eventPhase === event.CAPTURING_PHASE) {
					listener?.(event);
				}
			};
			captureListeners.set(listener, wrappedCallback);
			return wrappedCallback;
		}

		return listener;
	}

	const capture = normalizeOptions(options)?.capture;
	if (capture) {
		const callback = listener.handleEvent;

		const wrappedObject = {
			handleEvent: (event: Event) => {
				if (event.eventPhase === event.CAPTURING_PHASE) {
					callback(event);
				}
			},
		};

		captureListeners.set(listener, wrappedObject);
		return wrappedObject;
	}

	return listener;
}

export function retrieveWrappedListener(
	listener: EventListenerOrEventListenerObject | null
): EventListenerOrEventListenerObject | null {
	if (listener == null) return null;

	return captureListeners.get(listener) ?? listener;
}
