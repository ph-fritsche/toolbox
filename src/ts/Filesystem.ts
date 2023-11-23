export interface Filesystem {
    caseSensitive: boolean
    existsSync: (path: string) => boolean
    readFileSync: (path: string) => Buffer
    realpathSync: (path: string) => string
}
