import { createHash } from 'crypto'
import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import { Plugin, PluginContext, RenderedChunk, SourceMap } from 'rollup'

export type CachePluginOptions = {
    /**
     * Map of files to compare for freshness of module.
     * Defaults to the module file and the project lockfile.
     */
    hashFiles?: Record<string, string[]>
    /**
     * @default './yarn.lock'
     */
    lockFile?: string
    /**
     * @default './node_modules/toolbox/cached'
     */
    cacheDir?: string,
}

const cachedSuffix = '?cached'
const Cached = Symbol('cached')
type Cached = {
    fileName?: string
    hash: string
    idHash: string
    dependencies?: {
        internal?: string[]
        external?: string[]
    }
    code?: string
    map?: SourceMap
}
declare module 'rollup' {
    export interface CustomPluginOptions {
        [Cached]?: Cached
    }
}

export function createCachePlugin(
    {
        lockFile = './yarn.lock',
        cacheDir = './node_modules/.cache/toolbox/cache',
        hashFiles = {},
    }: CachePluginOptions = {},
    name = 'prebuilt',
): Plugin {
    const fileHash = new Map<string, Promise<Buffer>>()

    const absCacheDir = path.resolve(cacheDir)
    fsSync.mkdirSync(absCacheDir, {recursive: true})

    const cached = new Map<string, Promise<Cached|undefined>>()

    const emittedCached = new Set<string>()
    const renderedChunks = new Map<string, RenderedChunk>()

    function writeCached(
        {idHash, ...cached}: Cached,
    ) {
        return fs.writeFile(path.join(absCacheDir, idHash), JSON.stringify(cached))
    }

    function getCached(
        idHash: string,
    ) {
        if (!cached.has(idHash)) {
            cached.set(idHash, fs.readFile(path.join(absCacheDir, idHash)).then(
                b => {
                    try {
                        return {idHash, ...JSON.parse(String(b))} as Cached
                    } catch {
                        return undefined
                    }
                },
                () => undefined),
            )
        }
        return cached.get(idHash) as Promise<Cached|undefined>
    }

    async function emitCached(
        this: PluginContext,
        idHash: string,
        chunk: Cached,
    ) {
        if (emittedCached.has(idHash)) {
            return
        }
        emittedCached.add(idHash)

        this.emitFile({
            type: 'asset',
            fileName: chunk.fileName,
            source: chunk.code,
        })

        return emitDependencies.call(this, chunk)
    }

    async function emitDependencies(
        this: PluginContext,
        chunk: Cached,
    ) {
        await Promise.all(
            (chunk.dependencies?.internal ?? []).map(h => getCached(h)
                .then(c => {
                    if (!c) {
                        throw new Error(`Missing/corrupted cached dependency "${h}" in "${String(chunk.fileName)}".`)
                    }

                    return emitCached.call(this, h, c)
                }),
            ),
        )
    }

    return {
        name,
        buildStart() {
            emittedCached.clear()
        },
        async resolveId(source, importer, options) {
            if (!importer) {
                const resolved = await this.resolve(source, importer, {skipSelf: true, ...options})

                if (!resolved || resolved.external) {
                    return resolved
                }

                const id = resolved.id.split('?')[0]
                const hashFileIds = hashFiles[source] ?? [resolved.id, lockFile]

                hashFileIds.forEach(f => {
                    if (!fileHash.has(f)) {
                        fileHash.set(f, new Promise((res, rej) => {
                            fs.readFile(f).then(
                                content => res(createHash('sha1').update(content).digest()),
                                r => rej(r),
                            )
                        }))
                    }
                })

                const idHash = createHash('sha1').update(id).digest('hex')

                const hashFileHash = createHash('sha1')
                hashFileHash.update(id)
                for await (const h of hashFileIds.map(f => fileHash.get(f) as Promise<Buffer>)) {
                    hashFileHash.update(h)
                }
                const hash = hashFileHash.digest('hex')

                const cached = await getCached(idHash)

                const meta = {
                    ...resolved.meta,
                    [Cached]: {
                        ...cached,
                        idHash,
                        hash,
                    },
                }

                if (cached?.hash === hash) {
                    return {
                        id: `${id}${cachedSuffix}`,
                        meta,
                    }
                }

                return {
                    id: resolved.id,
                    meta,
                }
            }
        },
        async load(id) {
            if (!id.endsWith(cachedSuffix)) {
                return
            }

            const cached = this.getModuleInfo(id)?.meta[Cached]

            return [
                'export default undefined',
                ...(cached?.dependencies?.external?.map(id => `import "${id}"`) ?? []),
            ].join('\n')
        },
        renderStart() {
            renderedChunks.clear()
        },
        async renderChunk(code, chunk) {
            if (!chunk.facadeModuleId?.endsWith(cachedSuffix)) {
                renderedChunks.set(chunk.fileName, chunk)
            } else if (chunk.facadeModuleId.endsWith(cachedSuffix)) {
                const cached = this.getModuleInfo(chunk.facadeModuleId)?.meta[Cached]
                if (cached?.code) {
                    await emitDependencies.call(this, cached)
                    return {
                        code: cached.code,
                        map: cached.map,
                    }
                }
            }
            return null
        },
        async generateBundle(options, bundle)  {
            await Promise.all(Array.from(Object.entries(bundle)).map(([fileName, chunk]) => {
                if (chunk.type === 'chunk') {
                    const id = chunk.facadeModuleId ? chunk.facadeModuleId.split('?', 2)[0] : fileName
                    const info = chunk.facadeModuleId ? this.getModuleInfo(id) : undefined

                    const idHash = createHash('sha1').update(id).digest('hex')
                    const hash = info?.meta[Cached]?.hash as string

                    const dependencies: Cached['dependencies'] = {external: [], internal: []}
                    for (const importedId of chunk.imports) {
                        if (renderedChunks.has(importedId)) {
                            dependencies.internal?.push(createHash('sha1').update(importedId).digest('hex'))
                        } else {
                            dependencies.external?.push(importedId)
                        }
                    }

                    return writeCached({
                        idHash,
                        hash,
                        fileName,
                        dependencies,
                        code: chunk.code,
                        map: chunk.map ?? undefined,
                    })
                }
            }))
        },
    }
}
