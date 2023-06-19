import fs from 'node:fs'
import fsPromise from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { transform as swcTransform } from '@swc/core'
import ts from 'typescript'

/** @type {Map<string, string|undefined>} */
const configLocation = new Map()
/** @type {Map<string, ts.ParsedTsconfig>} */
const configParsed = new Map()

/**
 * @param {string|undefined} parentURL
 */
function findConfigFile(parentURL) {
    if (!parentURL) {
        return undefined
    }
    const dir = path.dirname(parentURL)

    if (!configLocation.has(dir)) {
        if (dir.startsWith('file://')) {
            configLocation.set(dir, ts.findConfigFile(dir.substring(7), fs.existsSync))
        }
    }

    return configLocation.get(dir)
}

const tsModuleResolutionCache = ts.createModuleResolutionCache(
    process.cwd(),
    s => {
        try {
            return fs.realpathSync(s)
        } catch {
            return s
        }
    },
)

/**
 * @param {string} configFile
 * @returns {Promise<ts.ParsedCommandLine>}
 */
async function parseConfigFile(configFile) {
    if (!configParsed.has(configFile)) {
        const content = await fsPromise.readFile(configFile, 'utf8')
        const { config } = ts.parseConfigFileTextToJson(configFile, content)
        if (config) {
            const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(configFile))
            configParsed.set(configFile, parsed)
        }
    }

    return configParsed.get(configFile)
}

/**
 * @type {(specifier: string, importer: string|undefined) => Promise<string|undefined>}
 */
export const tsResolve = async (specifier, importer) => {
    if (!importer
        && specifier.startsWith('file:///')
        && /\.tsx?(\?|$)/.test(specifier)
    ) {
        return specifier
    }

    if (
        importer?.startsWith('file://')
        && /\.tsx?(\?|$)/.test(importer)
        && !/^[\w@]/.test(specifier)
    ) {
        const configFile = findConfigFile(importer)
        if (configFile) {
            const { options } = await parseConfigFile(configFile)
            const { resolvedModule } = ts.resolveModuleName(
                specifier,
                importer.substring(7),
                options,
                ts.sys,
                tsModuleResolutionCache,
                undefined,
                ts.ModuleKind.CommonJS,
            )
            if (resolvedModule) {
                return `file://${resolvedModule.resolvedFileName}`
            }
        }
    }
}

/**
 * @type {(
 *   content: string,
 *   url: string,
 *   options?: {
 *     coverageVariable?: string
 *   }
 * ) => Promise<{code: string, map: string}>}
 */
export const transform = async (content, url, {
    coverageVariable,
} = {}) => {
    const isTs = /\.[tj]sx?(\?|$)/.test(url)
    const plugins = []
    if (coverageVariable) {
        plugins.push(['swc-plugin-coverage-instrument', {
            coverageVariable,
        }])
    }

    return await swcTransform(content, {
        filename: url,
        jsc: {
            target: 'es2022',
            parser: {
                syntax: isTs ? 'typescript' : 'ecmascript',
            },
            preserveAllComments: true,
            experimental: {
                plugins,
            },
        },
        sourceMaps: 'inline',
    })
}
