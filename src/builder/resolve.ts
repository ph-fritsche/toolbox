import { lstat } from 'fs/promises'
import path from 'path'
import { Plugin } from 'rollup'
import ts, { CompilerOptions } from 'typescript'

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

    const isdir = await lstat(absPath).then(stats => stats.isDirectory(), () => false)
    const lookupBase = isdir ? path.join(absPath, 'index') : absPath

    for (const ext of ['.ts', '.mjs', '.js']) {
        const lookupFile = `${lookupBase}${ext}`
        const exists = await lstat(lookupFile).then(() => true, () => false)
        if (exists) {
            _matchedFiles[absPath] = lookupFile
            return lookupFile
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
    resolve: (id: string) => string,
    rewriteNodeModuleIds?: NodeModuleIdRewrite,
    name = 'node-import-resolver',
): Plugin {
    return{
        name,
        
        async resolveId(moduleName, importer) {
            if (moduleName.startsWith('\0')
                || moduleName.includes(':')
                || moduleName.includes('?')
                || !importer
                || importer.startsWith('\0')
                || importer.includes('?')
                // || moduleName.includes('/node_modules/')
                // || importer.includes('/node_modules/')
            ) {
                return
            }

            const resolved = moduleName.startsWith('.')
                ? resolve(path.join(path.dirname(importer), moduleName))
                : resolve(moduleName)

            if (resolved === moduleName && rewriteNodeModuleIds) {
                return rewriteNodeModuleIds(moduleName)
            }

            return resolved
        },
    }
}
