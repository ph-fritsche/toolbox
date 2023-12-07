export interface File {
    content: string|Uint8Array
    mimeType?: string
    origin?: string
    mtime?: Date
}

export interface FileLoader {
    load(path: string): Promise<File|undefined>|undefined
}

export class FileProvider {
    constructor(
        public readonly loaders: Iterable<FileLoader> = [],
        public readonly files: Map<string, Promise<File>> = new Map(),
    ) {}

    async get(name: string): Promise<File> {
        if (!this.files.has(name)) {
            this.files.set(name, this.load(name))
        }
        return this.files.get(name) as Promise<File>
    }

    invalidate(name: string) {
        this.files.delete(name)
    }

    invalidateIfStartsWith(namespace: string) {
        for (const k of this.files.keys()) {
            if (k.startsWith(namespace)) {
                this.files.delete(k)
            }
        }
    }

    protected async load(
        name: string,
    ): Promise<File> {
        for (const l of this.loaders) {
            const r = await l.load(name)
            if (r) {
                return r
            }
        }
        throw undefined
    }
}
