import { stat } from 'fs/promises'
import path from 'path'
import { Plugin } from 'rollup'
import ts, { CompilerOptions } from 'typescript'
import { resolve as importResolve } from 'import-meta-resolve'
import requireResolveAsync from 'resolve'
import { isNodeJsBuiltin } from '../module'

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

const _resolvedTsPath: Record<string, string | undefined | false> = {}
async function resolveTsPaths(
    moduleName: string,
    {
        baseUrl = '.',
        paths,
    }: ts.CompilerOptions,
) {
    if (moduleName in _resolvedTsPath) {
        return _resolvedTsPath[moduleName]
    }
    let fail: undefined | false
    for (const [key, mapping] of Object.entries(paths ?? [])) {
        const re = new RegExp(`^${key.replace('*', '(.*)')}$`)
        const m = moduleName.match(re)
        if (m) {
            fail = false
            for (let p of mapping) {
                m.slice(1).forEach(p_ => {
                    p = p.replace('*', p_)
                })
                const f = await matchFiles(p, baseUrl)
                if (f) {
                    _resolvedTsPath[moduleName] = f
                    return f
                }
            }
        }
    }
    _resolvedTsPath[moduleName] = fail
    return fail
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
    compilerOptions: CompilerOptions,
    name = 'ts-import-resolver',
): Plugin {
    return {
        name,
        async resolveId(moduleName, importer) {
            if (!importer || !/\.tsx?$/.test(importer)) {
                return undefined
            }
            const resolved = moduleName.startsWith('.')
                ? await matchFiles(moduleName, path.dirname(importer))
                : await resolveTsPaths(moduleName, compilerOptions)

            return resolved
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

            if (isNodeJsBuiltin(moduleName)) {
                return
            }

            let resolved: string|undefined = undefined

            if (moduleName.startsWith('.')) {
                resolved = await matchFiles(moduleName, path.dirname(importer))
            }

            if (!resolved) {
                resolved = await importResolve(moduleName, `file://${importer}`)
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
            if (isNodeJsBuiltin(moduleName)) {
                return moduleName
            }
        }
    }
}
