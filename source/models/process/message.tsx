export type Message = {
	id: string;
	timestamp: number
	content: string
	channel: 'stdout' | 'stderr' | 'debug'
}

export function createMessage(content: string, channel: 'stdout' | 'stderr' | 'debug'): Message {
	return {
		id: crypto.randomUUID(),
		timestamp: Date.now(),
		content,
		channel,
	}
}
