import { stat } from 'fs/promises'
import path from 'path'
import { Plugin } from 'rollup'
import requireResolveAsync from 'resolve'
import { isBuiltin } from 'node:module'
import type { TsConfigResolver, TsModuleResolver } from '../../ts'

function requireResolve(moduleName: string, importer: string) {
    return new Promise<string|undefined>((res, rej) => {
        requireResolveAsync(moduleName, {
            basedir: importer ? path.dirname(importer) : process.cwd(),
        }, (err, resolved) => {
            if (err) {
                rej(err)
            } else {
                res(resolved)
            }
        })
    })
}

const _absPath: Record<string, string> = {}
const _matchedFiles: Record<string, string | undefined> = {}
async function matchFiles(
    moduleName: string,
    from: string,
) {
    _absPath[`${from};${moduleName}`] ??= path.resolve(from, moduleName)
    const absPath = _absPath[`${from};${moduleName}`]
    if (absPath in _matchedFiles) {
        return _matchedFiles[absPath]
    }

    const stats = await stat(absPath).catch(() => undefined)
    if (stats?.isFile()) {
        _matchedFiles[absPath] = absPath
        return absPath
    }

    const lookupBase = [absPath]
    if (stats?.isDirectory() && !await stat(path.join(absPath, 'package.json')).catch(() => undefined)) {
        lookupBase.push(path.join(absPath, 'index'))
    }

    for (const base of lookupBase) {
        for (const ext of ['.ts', '.tsx', '.mjs', '.js']) {
            const lookupFile = `${base}${ext}`
            const exists = await stat(lookupFile).then(() => true, () => false)
            if (exists) {
                _matchedFiles[absPath] = lookupFile
                return lookupFile
            }
        }
    }

    _matchedFiles[absPath] = undefined
}

export function createTsResolvePlugin(
    configResolver: TsConfigResolver,
    moduleResolver: TsModuleResolver,
    name = 'ts-import-resolver',
): Plugin {
    return {
        name,
        resolveId(moduleName, importer) {
            if (!importer || !/\.tsx?$/.test(importer)) {
                return undefined
            }

            const compilerOptions = configResolver.getCompilerOptions(path.dirname(importer))

            return moduleResolver.resolveModule(moduleName, importer, compilerOptions)
        },
    }
}

export type NodeModuleIdRewrite = (id: string) => string

export function createNodeResolvePlugin(
    name = 'node-import-resolver',
): Plugin {
    return{
        name,

        async resolveId(moduleName, importer) {
            if (moduleName.startsWith('\0')
                || moduleName.includes(':')
                || moduleName.includes('?')
                || !importer
            ) {
                return
            }

            if (isBuiltin(moduleName)) {
                return
            }

            let resolved: string|undefined = undefined

            if (moduleName.startsWith('.')) {
                resolved = await matchFiles(moduleName, path.dirname(importer))
            }

            if (!resolved) {
                if (!import.meta.resolve) {
                    throw new Error('`import.meta.resolve` is required. Run with `--experimental-import-meta-resolve`!')
                }
                resolved = await import.meta.resolve(moduleName, `file://${importer}`)
                    .catch(() => undefined)

                if (resolved?.startsWith('file://')) {
                    resolved = resolved.substring(7)
                    resolved = await stat(resolved).then(
                        s => s.isFile() ? resolved : undefined,
                        () => undefined,
                    )
                }
            }

            if (!resolved) {
                resolved = await requireResolve(moduleName, importer)
                    .catch(() => undefined)
            }

            if (resolved === moduleName) {
                return undefined
            }

            return resolved
        },
    }
}

export function createNodeCoreResolvePlugin(
    name = 'node-import-resolver-core',
): Plugin {
    return {
        name,

        async resolveId(moduleName) {
            if (isBuiltin(moduleName)) {
                return moduleName
            }
        },
    }
}
