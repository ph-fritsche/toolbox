import path from 'node:path'
import module from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { TsConfigResolver, TsModuleResolver } from '../ts'

export interface ImportResolver {
    resolve(
        specifier: string,
        importerUrl: URL,
    ): Promise<string>|string
}

export class ImportResolverStack implements ImportResolverStack {
    constructor(
        protected readonly callbacks: Iterable<ImportResolverCallback>,
    ) {}

    async resolve(
        specifier: string,
        importerUrl: URL,
    ) {
        let resolved = undefined
        for (const f of this.callbacks) {
            resolved = await f(resolved, specifier, importerUrl) || resolved
        }
        resolved = resolved?.replace(/^node:\/\//, 'node:')
        return String(resolved ?? specifier)
    }
}

/**
 * Resolve specifier to a URL.
 *
 * File paths should be converted per [`url.pathToFileURL()`](https://nodejs.org/api/url.html#urlpathtofileurlpath)
 *
 * Refer node built-ins per `node://`.
 */
export type ImportResolverCallback = (
    /** Result of previous callbacks */
    resolved: string|undefined,
    specifier: string,
    importerUrl: URL,
) => Promise<string|undefined>|string|undefined

function isConstrainHit<A extends unknown[]>(
    str: string,
    constrain: RegExp[] | ((str: string, ...additionalArgs: A) => boolean),
    ...args: A
) {
    return typeof constrain === 'function'
        ? constrain(str, ...args)
        : constrain.some(r => r.test(str))
}

export type ImportResolverImporterConstrain = (
    /** Path of the importer relative to the rootDir. */
    importerPath: string,
    importerUrl: URL,
) => boolean

export function constrainResolverToImporter(
    cb: ImportResolverCallback,
    constrain: {
        include?: RegExp[] | ImportResolverImporterConstrain
        exclude?: RegExp[] | ImportResolverImporterConstrain
    } = {},
    /**
     * URL of rootDir for subpaths handled by `include` and `exclude` constrains.
     * Defaults to current working directory.
     */
    rootDirUrl = String(pathToFileURL(process.cwd())),
): ImportResolverCallback {
    rootDirUrl += rootDirUrl.endsWith('/') ? '' : '/'

    return (resolved, specifier, importerUrl) => {
        const absolute = String(importerUrl)
        if (!absolute.startsWith(rootDirUrl)) {
            return undefined
        }

        const sub = absolute.substring(rootDirUrl.length)
        if (constrain.include && !isConstrainHit(sub, constrain.include, importerUrl)) {
            return undefined
        } if (constrain.exclude && isConstrainHit(sub, constrain.exclude, importerUrl)) {
            return undefined
        }

        return cb(resolved, specifier, importerUrl)
    }
}

export type ImportResolverResolvedConstrain = (
    resolved: string,
) => boolean

export function constrainResolverToResolved(
    cb: ImportResolverCallback,
    constrain: {
        include?: RegExp[] | ImportResolverResolvedConstrain
        exclude?: RegExp[] | ImportResolverResolvedConstrain
    } = {},
    /**
     * URL of rootDir for subpaths handled by `include` and `exclude` constrains.
     * Defaults to current working directory.
     */
    rootDirUrl = String(pathToFileURL(process.cwd())),
): ImportResolverCallback {
    rootDirUrl += rootDirUrl.endsWith('/') ? '' : '/'

    return (resolved, specifier, importerUrl) => {
        if (!resolved) {
            return undefined
        }

        const absolute = String(new URL(resolved, importerUrl))
        if (!absolute.startsWith(rootDirUrl)) {
            return undefined
        }

        const sub = absolute.substring(rootDirUrl.length)
        if (constrain.include && !isConstrainHit(sub, constrain.include)) {
            return undefined
        } if (constrain.exclude && isConstrainHit(sub, constrain.exclude)) {
            return undefined
        }

        return cb(resolved, specifier, importerUrl)
    }
}

/** Remove `node:` prefix from module name. Return `undefined` if `moduleId` is not a built-in module. */
export function normalizeNodeBuiltin(moduleId: string) {
    return module.isBuiltin(moduleId)
        ? moduleId.startsWith('node:') ? moduleId.substring(5) : moduleId
        : undefined
}

/** Resolve built-in modules */
export function createNodeBuiltinResolver(
    /**
     * If given, references to node built-in modules are replaced. E.g. to serve polyfills for browser environments
     */
    replacement?: Record<string, string>,
    /**
     * If `replacement` is given, this callback will be called for every imported node built-in that is missing.
     *
     * The default callback throws an error which states the missing module.
     */
    onMissingReplacement = (
        /** The normalized specifier without `node:` prefix. */
        specifier: string,
        importerUrl: URL,
    ): string => {
        throw new Error(`Node built-in "${specifier}" imported by "${String(importerUrl)}" has no replacement.`)
    },
): ImportResolverCallback {
    return (moduleId, specifier, importerUrl) => {
        const id = normalizeNodeBuiltin(moduleId || specifier)
        if (!id) {
            return undefined
        } else if (!replacement) {
            return `node://${id}`
        } else if (!replacement[id]) {
            return onMissingReplacement(id, importerUrl)
        }
        return replacement[id]
    }
}

/** Get the authority (userinfo, hostname and port). */
export function getUrlAuthority(url: URL) {
    return (url.username ? url.username + (url.password ? ':' + url.password : '' ) + '@' : '')
        + url.host
}

export function toRelative(to: string, importerUrl: URL) {
    if (to.startsWith('.')) {
        return to
    }

    if (importerUrl.protocol === 'file:' && path.isAbsolute(to)) {
        const rel = path.relative(path.dirname(fileURLToPath(importerUrl)), to)
        return rel.startsWith('.') ? rel : './' + rel
    }

    const context = importerUrl.protocol + '//' + getUrlAuthority(importerUrl) + '/'
    if (to.startsWith(context)) {
        const rel = path.posix.relative(path.dirname(importerUrl.pathname), '/' + to.substring(context.length))
        return rel.startsWith('.') ? rel : './' + rel
    }
}

export function createToRelativeResolver(): ImportResolverCallback {
    return (resolved, specifier, importerUrl) => resolved && toRelative(resolved, importerUrl)
}

export function createTsResolver(
    tsConfigResolver: TsConfigResolver,
    tsModuleResolver: TsModuleResolver,
): ImportResolverCallback {
    return (resolved, specifier, importerUrl) => {
        if (resolved || importerUrl.protocol !== 'file:') {
            return undefined
        }

        const importerPath = fileURLToPath(importerUrl)
        const compilerOptions = tsConfigResolver.getCompilerOptions(path.dirname(importerPath))

        const resolvedId = tsModuleResolver.resolveModule(specifier, importerPath, compilerOptions)

        return resolvedId?.startsWith('/') ? String(pathToFileURL(resolvedId)) : resolvedId
    }
}

/**
 * Resolve per `import.meta.resolve`
 *
 * @see https://nodejs.org/api/esm.html#importmetaresolvespecifier
 */
export async function createNodeImportResolver(catchErrors = true): Promise<ImportResolverCallback> {
    // Requires experimental flag until node@20.6
    if (typeof import.meta.resolve !== 'function') {
        throw '`import.meta.resolve` is missing. Run with `--experimental-import-meta-resolve`.'
    }

    // Returns string since node@20.0
    // Support for second parameter still requires experimental flag
    if (await import.meta.resolve('./bar.js', 'http://example.org/foo.js') !== 'http://example.org/bar.js') {
        throw '`import.meta.resolve` does not support second parameter. Run with `--experimental-import-meta-resolve`.'
    }

    return async (resolved, specifier, importerUrl) => {
        if (resolved) {
            return undefined
        }

        try {
            type R = (s: string, i: string) => Promise<string>|string
            return await (import.meta.resolve as R)(specifier, String(importerUrl))
        } catch(e) {
            if (catchErrors) {
                return undefined
            }
            throw e
        }
    }
}

/**
 * Resolve per `require.resolve`
 *
 * @see https://nodejs.org/api/modules.html#requireresolverequest-options
 */
export function createNodeRequireResolver(catchErrors = true): ImportResolverCallback {
    return (resolved, specifier, importerUrl) => {
        if (resolved || importerUrl.protocol !== 'file:') {
            return undefined
        }

        const require = module.createRequire(importerUrl)
        try {
            const resolvedId = require.resolve(specifier)
            return resolvedId?.startsWith('/') ? String(pathToFileURL(resolvedId)) : resolvedId
        } catch(e) {
            if (catchErrors) {
                return undefined
            }
            throw e
        }
    }
}

/**
 * Dictionary of module specifiers and their replacement.
 *
 * `{'@foo/bar': 'BAR'}` will replace the import of `@foo/bar` with
 * - `globalThis.BAR` as default export
 *
 * Named exports need to be statically defined.  \
 * `{'@foo/bar': {default: 'BAR', x: 'X', y: null}}` will replace the import with
 * - `globalThis.BAR` as default export
 * - `globalThis.X` as named export `x`
 * - `globalThis.BAR.y` as named export `y`
 */
export type GlobalsResolverDict = Record<string, string|Record<string, string|null>>

/**
 * Replace modules with global variables.
 *
 * This will replace the imports with a `data:` module that exports the global variables.
 */
export function createGlobalsResolver(
    globalVars: GlobalsResolverDict,
): ImportResolverCallback {
    return (resolved, specifier) => {
        if (specifier.startsWith('.') || !(specifier in globalVars)) {
            return undefined
        }
        const entry = globalVars[specifier]
        const normalized = typeof entry === 'string' ? {default: entry} : entry
        const statements = []
        for (const [name, key] of Object.entries(normalized)) {
            if (name === 'default') {
                statements.push(`export default globalThis[${JSON.stringify(key)}]`)
            } else if (key === null) {
                statements.push(`export const ${name} = globalThis[${JSON.stringify(normalized.default)}][${JSON.stringify(name)}]`)
            } else {
                statements.push(`export const ${name} = globalThis[${JSON.stringify(key)}]`)
            }
        }
        return `data:text/javascript,${statements.join(';')}`
    }
}
