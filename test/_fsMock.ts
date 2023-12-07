import { MockedObject } from 'jest-mock'
import { AsyncFilesystem, SyncFilesystem } from '#src/files'

export function setupFilesystemMock(
    files: Record<string, string|true>,
): MockedObject<SyncFilesystem> & MockedObject<AsyncFilesystem> {
    const hasFileOrDir = (p: string) => p in files || Object.keys(files).some(k => k.startsWith(p + '/'))
    return {
        caseSensitive: true,
        existsSync: mock.fn(hasFileOrDir),
        readFileSync: mock.fn(p => {
            if (typeof files[p] === 'string') {
                return Buffer.from(files[p] as string)
            }
            throw 'some filesystem error'
        }),
        realpathSync: mock.fn(p => {
            if (hasFileOrDir(p)) {
                return p
            }
            throw 'some filesystem error'
        }),
        exists: mock.fn(p => Promise.resolve(hasFileOrDir(p))),
        readFile: mock.fn(p => {
            if (typeof files[p] === 'string') {
                return Promise.resolve(Buffer.from(files[p] as string))
            }
            return Promise.reject('some filesystem error')
        }),
        realpath: mock.fn(p => {
            if (hasFileOrDir(p)) {
                return Promise.resolve(p)
            }
            return Promise.reject('some filesystem error')
        }),
    }
}
