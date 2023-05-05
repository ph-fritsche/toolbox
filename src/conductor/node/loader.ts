import module from 'module'

/**
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray
 */
type TypedArray =
    | Int8Array | Uint8Array | Uint8ClampedArray
    | Int16Array | Uint16Array // missing |Uint16ClampedArray
    | Int32Array | Uint32Array // missing |Uint32ClampedArray
    | Float32Array
    | Float64Array
    | BigInt64Array | BigUint64Array

type PromiseOrReturn<T> = Promise<T> | T

/**
 * @see https://nodejs.org/api/esm.html#resolvespecifier-context-nextresolve
 */
type NodeResolveContext = {
    conditions: string[]
    importAssertions: object
    parentURL?: string
}
type NodeResolverResult = PromiseOrReturn<{
    format?: string|null
    shortCircuit?: boolean
    url: string
}>
type NodeResolver = (
    specifier: string,
    context: NodeResolveContext,
    nextResolve: (specifier: string, context: NodeResolveContext) => NodeResolverResult,
) => NodeResolverResult

/**
 * @see https://nodejs.org/api/esm.html#loadurl-context-nextload
 */
type NodeLoaderContext = {
    conditions: string[]
    importAssertions: object
    format?: string | null
}
type NodeLoaderResult = PromiseOrReturn<{
    format: string
    shortCircuit?: boolean
    source: string|ArrayBuffer|TypedArray
}>
type NodeLoader = (
    url: string,
    context: NodeLoaderContext,
    nextLoad: (url: string, context: NodeLoaderContext) => NodeLoaderResult,
) => NodeLoaderResult

export const resolve: NodeResolver = async (specifier, context, nextResolve) => {
    const id = specifier.startsWith('node:') ? specifier.substring(5) : specifier
    if (module.builtinModules.includes(id)) {
        return {
            shortCircuit: true,
            url: String(new URL(`node://${id}`)),
        }
    }

    return nextResolve(specifier, context)
}

export const load: NodeLoader = async (url, context, nextLoad) => {
    if (url.startsWith('node://')) {
        return nextLoad('node:' + url.substring(7), context)
    }

    return nextLoad(url, context)
}
