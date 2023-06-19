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

type PromiseOrReturn<T> = Promise<T> | PromiseLike<T> | T

declare namespace NodeJSLoader {
    /**
     * @see https://nodejs.org/api/esm.html#resolvespecifier-context-nextresolve
     */
    export type ResolverContext = {
        conditions: string[]
        importAssertions: object
        parentURL?: string
    }
    export type ResolverResult = PromiseOrReturn<{
        format?: Format|null
        shortCircuit?: boolean
        url: string
    }>
    type Format = 'builtin' | 'commonjs' | 'json' | 'module' | 'wasm'
    export type Resolver = (
        specifier: string,
        context: ResolverContext,
        nextResolve: (specifier: string, context: ResolverContext) => ResolverResult,
    ) => ResolverResult

    /**
     * @see https://nodejs.org/api/esm.html#loadurl-context-nextload
     */
    export type LoaderContext = {
        conditions: string[]
        importAssertions: object
        format?: string | null
    }
    export type LoaderResult = PromiseOrReturn<{
        format: string
        shortCircuit?: boolean
        source: string|ArrayBuffer|TypedArray
    }>
    export type Loader = (
        url: string,
        context: LoaderContext,
        nextLoad: (url: string, context: LoaderContext) => LoaderResult,
    ) => LoaderResult
}
