import localforage from "localforage";

type CacheEntry<T> = {
	etag: string | null;
	value: T;
	savedAt: number;
};

const store = localforage.createInstance({
	name: "game-cache",
	storeName: "icon_etag_cache",
});

export async function cacheGet<T>(key: string): Promise<CacheEntry<T> | null> {
	const entry = await store.getItem<CacheEntry<T>>(key);
	return entry ?? null;
}

export async function cacheSet<T>(key: string, value: T, etag: string | null): Promise<void> {
	const entry: CacheEntry<T> = {
		etag: etag ?? null,
		value,
		savedAt: Date.now(),
	};

	await store.setItem(key, entry);
}

export async function cacheRemove(key: string): Promise<void> {
	await store.removeItem(key);
}

export async function pruneOldIcons(): Promise<void> {
	const now = Date.now();

	let keys: string[];
	try {
		keys = await store.keys();
	} catch {
		return;
	}

	for (const key of keys) {
		if (!key.startsWith("player-icon-")) continue;

		let entry: CacheEntry<unknown> | null;
		try {
			entry = await store.getItem<CacheEntry<unknown>>(key);
		} catch {
			continue;
		}

		if (!entry) continue;

		const savedAt = typeof entry.savedAt === "number" ? entry.savedAt : 0;
		if (now - savedAt <= 30 * 24 * 60 * 60 * 1000 /* 30 days */) continue;

		try {
			await store.removeItem(key);
		} catch {
			// ignore
		}
	}
}