import console from 'node:console'
import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { URL, fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'
import { transform } from '@swc/core'
import { TsConfigResolver, TsModuleResolver } from '../ts'
import { CachedFilesystem } from '../files'

const PARAM_INSTRUMENT_COVERAGE_VAR = 'coverage'

const cachedFs = new CachedFilesystem({
    caseSensitive: os.platform().startsWith('win'),
    existsSync: s => fs.existsSync(s),
    readFileSync: s => fs.readFileSync(s),
    realpathSync: s => fs.realpathSync(s),
})
const moduleResolver = new TsModuleResolver(cachedFs)
const configResolver = new TsConfigResolver(cachedFs)

export const resolve: NodeJSLoader.Resolver = async (specifier, context, nextResolve) => {
    if (!context.parentURL
        && specifier.startsWith('file://')
    ) {
        return {
            shortCircuit: true,
            url: specifier,
        }
    } else if (
        !/^[\w@]/.test(specifier)
        && context.parentURL?.startsWith('file://')
        && !context.parentURL.includes('/node_modules/')
    ) {
        const parentUrl = new URL(context.parentURL)
        const parentPath = fileURLToPath(parentUrl)
        if (/\.[tj]sx?$/.test(parentPath)) {
            const compilerOptions = configResolver.getCompilerOptions(path.dirname(parentPath))
            const resolved = moduleResolver.resolveModule(
                specifier,
                parentPath,
                compilerOptions,
                ts.ModuleKind.ESNext,
            )
            if (resolved) {
                let resolvedUrl = pathToFileURL(resolved)
                const coverageVar = parentUrl.searchParams.get(PARAM_INSTRUMENT_COVERAGE_VAR)
                if (coverageVar) {
                    resolvedUrl.searchParams.set(PARAM_INSTRUMENT_COVERAGE_VAR, coverageVar)
                }
                return {
                    shortCircuit: true,
                    url: String(resolvedUrl),
                }
            }
        }
    }

    return nextResolve(specifier, context)
}

export const load: NodeJSLoader.Loader = async (url, context, nextLoad) => {
    if (url.startsWith('file://')
        && /\.[tj]sx?(\?|$)/.test(url)
        && !url.includes('/node_modules/')
    ) {
        try {
            const moduleUrl = new URL(url)
            const modulePath = fileURLToPath(moduleUrl)
            const coverageVariable = moduleUrl.searchParams.get(PARAM_INSTRUMENT_COVERAGE_VAR)

            const content = await fsPromise.readFile(modulePath)

            const {code} = await transform(content.toString('utf8'), {
                filename: modulePath,
                jsc: {
                    target: 'es2022',
                    parser: /\.tsx?$/.test(modulePath)
                        ? {
                            syntax: 'typescript',
                            tsx: /\.tsx$/.test(modulePath),
                        }
                        : {
                            syntax: 'ecmascript',
                            jsx: /\.jsx$/.test(modulePath),
                        },
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
                shortCircuit: true,
                format: 'module',
                source: code,
            }
        } catch(e) {
            console.error(e)
            // let the next loader try to handle this
        }
    }

    return nextLoad(url, context)
}
