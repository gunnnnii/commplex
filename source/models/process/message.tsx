export type Message = {
	id: string;
	timestamp: number
	content: string
	channel: 'stdout' | 'stderr'
}

export function createMessage(content: string, channel: 'stdout' | 'stderr'): Message {
	return {
		id: crypto.randomUUID(),
		timestamp: Date.now(),
		content,
		channel,
	}
}
