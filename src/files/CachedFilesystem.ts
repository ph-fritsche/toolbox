import { SyncFilesystem } from './Filesystem'

class CachedError {
    constructor(
        public error: unknown,
    ) {}
}

export class CachedFilesystem implements SyncFilesystem {
    constructor(
        protected readonly filesystem: SyncFilesystem,
    ) {}
    protected resolveCache: Record<string, string> = {}
    protected existsCache: Record<string, boolean> = {}
    protected readFileCache: Record<string, Buffer> = {}

    protected get<T>(
        key: string,
        cache: Record<string, T|CachedError>,
        createValue: () => T,
    ) {
        if (!(key in cache)) {
            try {
                cache[key] = createValue()
            } catch (error) {
                cache[key] = new CachedError(error)
            }
        }

        if (cache[key] instanceof CachedError) {
            throw (cache[key] as CachedError).error
        }
        return cache[key] as T
    }

    get caseSensitive() {
        return this.filesystem.caseSensitive
    }

    realpathSync(
        path: string,
    ) {
        return this.get(path, this.resolveCache, () => this.filesystem.realpathSync(path))
    }

    existsSync(
        path: string,
    ) {
        return this.get(path, this.existsCache, () => this.filesystem.existsSync(path))
    }

    readFileSync(
        path: string,
    ) {
        return this.get(path, this.readFileCache, () => this.filesystem.readFileSync(path))
    }
}
