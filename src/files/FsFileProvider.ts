import fs from 'fs/promises'
import path from 'path'
import { File, FileProvider } from './FileProvider'

export class FsFileProvider extends FileProvider {
    constructor(
        dir: string,
    ) {
        super()
        this.dir = path.resolve(dir)
    }
    public readonly dir

    protected async load(name: string): Promise<File> {
        const filePath = path.join(this.dir, name)
        return {
            content: await fs.readFile(filePath),
            origin: filePath,
        }
    }
}
