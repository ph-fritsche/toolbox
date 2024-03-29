import swc from '@swc/core'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { File, FileLoader } from '../files'
import { ImportResolver } from './ImportResolver'

export interface ModuleTransformer {
    transform(
        module: swc.Module,
        sourcePath: string,
        type: 'typescript'|'ecmascript'|'commonjs'|'javascript',
    ): Promise<swc.Module>|swc.Module
}

/**
 * Load and transform local TS/JS modules.
 */
export class ModuleLoader implements FileLoader {
    constructor(
        protected readonly readFile: (sourcePath: string) => Promise<string|Buffer>,
        protected readonly sourceRoot: string,
        /**
         * Resolve a specifier from source to one that is supported by the target.
         *
         * E.g. for Typescript files this should resolve any `paths` from tsconfig
         * to relative or absolute URLs.
         *
         * If the code is to be used in a browser environment,
         * this should replace all imports of node built-ins with adequate polyfills.
         */
        protected readonly resolver: ImportResolver,
        /**
         * The variable to collect coverage. If falsey, the code will not be instrumented.
         */
        protected readonly getCoverageVar: (subPath: string) => string|undefined,
        protected readonly transformers: Iterable<ModuleTransformer> = [],
    ) {
        if (!path.isAbsolute(sourceRoot)) {
            throw new Error(`sourceRoot has to be an absolute path. Received "${sourceRoot}"`)
        }
        this.sourceUrlRoot = String(pathToFileURL(this.sourceRoot + (this.sourceRoot.endsWith('/') ? '' : '/')))
    }
    protected readonly sourceUrlRoot
    protected readonly compiler = new swc.Compiler()

    async load(subPath: string): Promise<File|undefined> {
        const sourceUrl = new URL(this.sourceUrlRoot + subPath)

        const type = this.getTypeFromExtension(sourceUrl.pathname)
        if (type === 'unsupported' || type === 'declaration') {
            return undefined
        }

        const sourcePath = fileURLToPath(sourceUrl)
        let sourceCode = (await this.readFile(sourcePath)).toString('utf8')

        const target: swc.JscTarget = 'es2022'

        const parseOptions: swc.ParseOptions = type === 'typescript'
            ? {
                syntax: 'typescript',
                tsx: sourceUrl.pathname.endsWith('x'),
                target,
            }
            : {
                syntax: 'ecmascript',
                jsx: sourceUrl.pathname.endsWith('x'),
                target,
                importAssertions: true,
            }

        let parsedModule = await this.compiler.parse(sourceCode, parseOptions, sourcePath)

        for (const t of this.transformers) {
            parsedModule = await t.transform(parsedModule, sourcePath, type)
        }

        const resolved: Promise<void>[] = []
        for (const stmt of parsedModule.body) {
            if ('source' in stmt && stmt.source) {
                const importedNames = []
                if (stmt.type === 'ExportAllDeclaration') {
                    importedNames.push('*')
                } else {
                    for (const s of stmt.specifiers) {
                        if (s.type === 'ImportNamespaceSpecifier' || s.type === 'ExportNamespaceSpecifier') {
                            importedNames.push('*')
                        } else if (s.type === 'ImportDefaultSpecifier' || s.type === 'ExportDefaultSpecifier') {
                            importedNames.push('default')
                        } else if (s.type === 'ImportSpecifier') {
                            importedNames.push((s.imported ?? s.local).value)
                        } else if (s.type === 'ExportSpecifier') {
                            importedNames.push(s.orig.value)
                        }
                    }
                }
                resolved.push((async () => {
                    const source = stmt.source as swc.StringLiteral
                    source.value = await this.resolver.resolve(source.value, sourceUrl, importedNames)
                    delete source.raw
                })())
            }
        }
        await Promise.all(resolved)

        const coverageVariable = this.getCoverageVar(subPath)

        const { code } = await this.compiler.transform(parsedModule, {
            cwd: this.sourceRoot,
            filename: sourcePath,
            sourceFileName: sourcePath,
            swcrc: false,
            configFile: false,
            module: {
                type: 'es6',
                ignoreDynamic: true,
            },
            jsc: {
                target,
                parser: parseOptions,
                preserveAllComments: true,
                experimental: {
                    emitAssertForImportAttributes: true,
                    keepImportAttributes: true,
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

    protected getTypeFromExtension(
        filePath: string,
    ) {
        const m = /(\.d)?\.([cm]?[tj]sx?)$/.exec(filePath)
        return !m ? 'unsupported'
            : m[1] ? 'declaration'
                : m[2].includes('t') ? 'typescript'
                    : m[2].startsWith('c') ? 'commonjs'
                        : m[2].startsWith('m') ? 'ecmascript'
                            : 'javascript'
    }
}
