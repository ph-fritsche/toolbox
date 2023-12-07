import { JscTarget, ParseOptions, parse, transform } from '@swc/core'
import { AsyncFilesystem } from '../files/Filesystem'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { File, FileLoader } from '../files'
import { ImportResolver } from './ImportResolver'

/**
 * Load and transform local TS/JS modules.
 */
export class ModuleLoader implements FileLoader {
    constructor(
        public readonly fs: AsyncFilesystem,
        public readonly sourceRoot: string,
        /**
         * Resolve a specifier from source to one that is supported by the target.
         *
         * E.g. for Typescript files this should resolve any `paths` from tsconfig
         * to relative or absolute URLs.
         *
         * If the code is to be used in a browser environment,
         * this should replace all imports of node built-ins with adequate polyfills.
         */
        public readonly resolver: ImportResolver,
        /**
         * The variable to collect coverage. If falsey, the code will not be instrumented.
         */
        public readonly getCoverageVar: (subPath: string) => string|undefined,
    ) {
        if (!path.isAbsolute(sourceRoot)) {
            throw new Error(`sourceRoot has to be an absolute path. Received "${sourceRoot}"`)
        }
        this.sourceUrlRoot = String(pathToFileURL(this.sourceRoot + (this.sourceRoot.endsWith('/') ? '' : '/')))
    }
    protected readonly sourceUrlRoot

    async load(subPath: string): Promise<File|undefined> {
        const sourceUrl = new URL(this.sourceUrlRoot + subPath)

        if (!/(?<!\.d)\.[tj]sx?$/.test(sourceUrl.pathname)) {
            return undefined
        }

        const sourcePath = fileURLToPath(sourceUrl)
        const content = await this.fs.readFile(sourcePath)

        const target: JscTarget = 'es2022'

        const isTs = /\.tsx?$/.test(sourceUrl.pathname)
        const parseOptions: ParseOptions = isTs
            ? {
                syntax: 'typescript',
                tsx: sourceUrl.pathname.endsWith('x'),
                target,
            }
            : {
                syntax: 'ecmascript',
                jsx: sourceUrl.pathname.endsWith('x'),
                target,
            }

        const parsedModule = await parse(content.toString('utf8'), parseOptions)

        const resolved: Promise<void>[] = []
        for (const stmt of parsedModule.body) {
            const source = 'source' in stmt ? stmt.source : undefined
            if (source) {
                resolved.push((async () => {
                    source.value = await this.resolver.resolve(source.value, sourceUrl)
                    delete source.raw
                })())
            }
        }
        await Promise.all(resolved)

        const coverageVariable = this.getCoverageVar(subPath)

        const { code } = await transform(parsedModule, {
            cwd: this.sourceRoot,
            filename: sourcePath,
            sourceFileName: sourcePath,
            module: {
                type: 'es6',
                ignoreDynamic: true,
            },
            jsc: {
                target,
                parser: parseOptions,
                preserveAllComments: true,
                experimental: {
                    plugins: coverageVariable
                        ? [
                            ['swc-plugin-coverage-instrument', {
                                coverageVariable,
                            }],
                        ]
                        : [],
                },
            },
            sourceMaps: 'inline',
        })

        return {
            content: code,
            mimeType: 'text/javascript',
        }
    }
}
