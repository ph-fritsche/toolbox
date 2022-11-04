import fs from 'fs/promises'
import path from 'path'
import { File, FileProvider } from './FileProvider'

export class FsFileProvider extends FileProvider {
    constructor(
        readonly dir: string
    ) {
        super()
    }

    protected async loadFile(filePath: string): Promise<File> {
        return {
            content: await fs.readFile(path.join(this.dir, filePath)),
        }
    }
}
