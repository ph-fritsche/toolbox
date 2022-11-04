export interface File {
    content: string|Uint8Array
    mtime?: Date
}

export class FileProvider {
    constructor(
        public files: Map<string, Promise<File>> = new Map()
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
        return this.files.get(filePath)
    }

    protected loadFile(filePath: string): Promise<File> {
        throw undefined
    }
}
