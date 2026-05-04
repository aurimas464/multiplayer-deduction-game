export class AsyncKeyLock<TKey> {
	private readonly queues = new Map<TKey, Promise<void>>();

	public async run<T>(key: TKey, fn: () => Promise<T>): Promise<T> {
		const previous = this.queues.get(key) ?? Promise.resolve();

		let release!: () => void;
		const current = new Promise<void>((resolve) => {
			release = resolve;
		});

		this.queues.set(key, previous.then(() => current));

		await previous;

		try {
			return await fn();
		} finally {
			release();

			if (this.queues.get(key) === current) {
				this.queues.delete(key);
			}
		}
	}
}