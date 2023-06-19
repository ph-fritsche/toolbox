import fsPromise from 'node:fs/promises'
import console from 'node:console'
import { transform, tsResolve } from './ts.js'
import { URL, fileURLToPath } from 'node:url'

const PARAM_INSTRUMENT_COVERAGE_VAR = 'coverage'

/**
 * @type {NodeJSLoader.Resolver}
 */
export const resolve = async (specifier, context, nextResolve) => {
    if (!context.parentURL
        && specifier.startsWith('file://')
    ) {
        return {
            shortCircuit: true,
            url: specifier,
        }
    } else if (/\.[tj]sx?(\?|$)/.test(context.parentURL)
        && !context.parentURL.includes('/node_modules/')
    ) {
        const resolved = await tsResolve(specifier, context.parentURL)
        const parentUrl = new URL(context.parentURL)
        if (resolved) {
            return {
                shortCircuit: true,
                url: (/^[\w@]/.test(specifier) || !parentUrl.searchParams.has(PARAM_INSTRUMENT_COVERAGE_VAR))
                    ? resolved
                    : resolved + `?${PARAM_INSTRUMENT_COVERAGE_VAR}=${encodeURIComponent(parentUrl.searchParams.get(PARAM_INSTRUMENT_COVERAGE_VAR))}`,
            }
        }
    }

    return nextResolve(specifier, context)
}

/**
 * @type {NodeJSLoader.Loader}
 */
export const load = async (url, context, nextLoad) => {
    if (url.startsWith('file://')
        && /\.[tj]sx?(\?|$)/.test(url)
        && !url.includes('/node_modules/')
    ) {
        try {
            const sourceUrl = new URL(url)
            const path = fileURLToPath(sourceUrl)
            const content = await fsPromise.readFile(path)
            const {code} = await transform(content.toString('utf8'), path, {
                coverageVariable: sourceUrl.searchParams.get(PARAM_INSTRUMENT_COVERAGE_VAR),
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
