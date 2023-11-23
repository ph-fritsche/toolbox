import { CachedFilesystem } from '#src/ts'
import { setupFilesystemMock } from './_helper'

test('forward `caseSensitive`', () => {
    const fs = setupFilesystemMock({})
    const cachedFs = new CachedFilesystem(fs)

    expect(cachedFs.caseSensitive).toBe(true)
    fs.caseSensitive = false
    expect(cachedFs.caseSensitive).toBe(false)
})

test('cache `existsSync`', () => {
    const fs = setupFilesystemMock({
        '/some/file': 'foo',
    })
    const cachedFs = new CachedFilesystem(fs)

    expect(cachedFs.existsSync('/some/file')).toBe(true)
    expect(cachedFs.existsSync('/some/file')).toBe(true)
    expect(cachedFs.existsSync('/other/file')).toBe(false)
    expect(fs.existsSync).toBeCalledTimes(2)

    fs.existsSync.mockImplementationOnce(() => { throw 'some error'})

    expect(() => cachedFs.existsSync('/error')).toThrow('some error')
    expect(() => cachedFs.existsSync('/error')).toThrow('some error')
    expect(fs.existsSync).toBeCalledTimes(3)
})

test('cache `readFileSync`', () => {
    const fs = setupFilesystemMock({
        '/some/file': 'foo',
    })
    const cachedFs = new CachedFilesystem(fs)

    expect(cachedFs.readFileSync('/some/file')).toEqual(Buffer.from('foo'))
    expect(cachedFs.readFileSync('/some/file')).toEqual(Buffer.from('foo'))
    expect(fs.readFileSync).toBeCalledTimes(1)

    expect(() => cachedFs.readFileSync('/some')).toThrow('some filesystem error')
    expect(fs.readFileSync).toBeCalledTimes(2)
})

test('cache `realpathSync`', () => {
    const fs = setupFilesystemMock({
        '/some/file': 'foo',
    })
    const cachedFs = new CachedFilesystem(fs)

    expect(cachedFs.realpathSync('/some/file')).toBe('/some/file')
    expect(cachedFs.realpathSync('/some/file')).toBe('/some/file')
    expect(fs.realpathSync).toBeCalledTimes(1)

    expect(() => cachedFs.realpathSync('/missing')).toThrow('some filesystem error')
    expect(fs.realpathSync).toBeCalledTimes(2)
})
