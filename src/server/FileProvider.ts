export interface File {
    content: string|Uint8Array
    origin?: string
    mtime?: Date
}

export class FileProvider {
    constructor(
        public origin: string = process.cwd(),
        public files: Map<string, Promise<File>> = new Map(),
    ) {}

    async getFile(filePath: string): Promise<File> {
        while (filePath.startsWith('/')) {
            filePath = filePath.substring(1)
        }
        if (filePath.startsWith('.')) {
            throw new Error('Relative paths are not supported by FileProvider')
        }
        if (!this.files.has(filePath)) {
            this.files.set(filePath, this.loadFile(filePath))
        }
        return this.files.get(filePath) as Promise<File>
    }

    protected loadFile(
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        _filePath: string,
    ): Promise<File> {
        throw undefined
    }
}
