import os from 'node:os'
import fs from 'node:fs'
import fsPromise from 'node:fs/promises'

export interface SyncFilesystem {
    caseSensitive: boolean
    existsSync: (path: string) => boolean
    readFileSync: (path: string) => Buffer
    realpathSync: (path: string) => string
}

export interface AsyncFilesystem {
    caseSensitive: boolean
    exists: (path: string) => Promise<boolean>
    readFile: (path: string) => Promise<Buffer>
    realpath: (path: string) => Promise<string>
}

export const realFilesystem: SyncFilesystem & AsyncFilesystem = {
    caseSensitive: !os.platform().startsWith('win'),
    exists: p => fsPromise.stat(p).then(() => true, () => false),
    readFile: fsPromise.readFile,
    realpath: fsPromise.realpath,
    existsSync: fs.existsSync,
    readFileSync: fs.readFileSync,
    realpathSync: fs.realpathSync,
}
