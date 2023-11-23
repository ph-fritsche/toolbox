import { MockedObject } from 'jest-mock'
import { Filesystem } from '#src/ts'

export function setupFilesystemMock(
    files: Record<string, string|true>,
): MockedObject<Filesystem> {
    const hasFileOrDir = (p: string) => p in files || Object.keys(files).some(k => k.startsWith(p + '/'))
    return {
        caseSensitive: true,
        existsSync: mock.fn(hasFileOrDir),
        readFileSync: mock.fn(p => {
            if (typeof files[p] === 'string') {
                return Buffer.from(files[p] as string)
            }
            console.log('readFileSync error', p)
            throw 'some filesystem error'
        }),
        realpathSync: mock.fn(p => {
            if (hasFileOrDir(p)) {
                return p
            }
            throw 'some filesystem error'
        }),
    }
}
