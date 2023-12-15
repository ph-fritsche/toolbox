import fs from 'node:fs/promises'
import path from 'node:path'
import { File, FileLoader } from '../files/FileProvider'

export class FsLoader implements FileLoader {
    constructor(
        dir: string,
        public readonly mimeTypeMap = new Map<string, string>(),
    ) {
        this.dir = path.resolve(dir)
    }
    public readonly dir

    async load(name: string): Promise<File> {
        if (name.startsWith('.') || name.includes('./')) {
            throw 'Forbidden'
        }

        const filePath = path.join(this.dir, name)
        return {
            content: await fs.readFile(filePath),
            mimeType: this.mimeTypeMap.get(path.extname(name)),
            origin: filePath,
        }
    }
}
