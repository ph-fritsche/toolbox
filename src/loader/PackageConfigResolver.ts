import path from 'node:path'
import { SyncFilesystem } from '../files'

export class PackageConfigResolver {
    constructor(
        protected readonly fs: SyncFilesystem,
    ) {}

    protected readonly resolved: Record<string, object> = {}

    getConfig(
        dirPath: string,
        configName = 'package.json',
    ) {
        const key = dirPath + path.delimiter + configName

        if (!(key in this.resolved)) {
            for (let current = dirPath, visitedKeys = [];;) {
                visitedKeys.push(current + path.delimiter + configName)

                let content
                try {
                    content = this.fs.readFileSync(current + path.sep + configName)
                } catch(e) {
                    if (!isENOENT(e)) {
                        throw e
                    }
                }
                if (content) {
                    try {
                        const parsed = JSON.parse(content.toString('utf8')) as unknown
                        if (!parsed || typeof parsed !== 'object') {
                            throw new Error(`Expected object`)
                        }
                        for (const v of visitedKeys) {
                            this.resolved[v] = parsed
                        }
                        break
                    } catch (e) {
                        if (e instanceof Error) {
                            e.message = `Invalid ${configName} at ${current}\n`
                        }
                        throw e
                    }
                }

                const parent = path.dirname(current)
                if (parent === current) {
                    throw new Error(`Could not find ${configName} for ${dirPath}`)
                }
                current = parent
            }
        }

        return this.resolved[key]
    }

    getJsModuleType(
        filePath: string,
    ) {
        const config = this.getConfig(path.dirname(filePath))
        return ('type' in config && config.type === 'module') ? 'ecmascript' : 'commonjs'
    }
}

function isENOENT(e: unknown): e is Error & {errno: number} {
    return e instanceof Error
        && 'code' in e
        && e.code === 'ENOENT'
}
