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
        return String(resolved ?? specifier)
    }
}

export type ImportResolverCallback = (
    /** Result of previous callbacks */
    resolved: string|undefined,
    specifier: string,
    importerUrl: URL,
) => Promise<string|undefined>|string|undefined

export type ImportResolverConstrain = (
    /** Path of the importer relative to the rootDir. */
    importerPath: string,
    importerUrl: URL,
) => boolean

export function constrainResolver(
    cb: ImportResolverCallback,
    include?: RegExp[] | ImportResolverConstrain,
    exclude?: RegExp[] | ImportResolverConstrain,
    /**
     * URL of rootDir for subpaths handled by `include` and `exclude` constrains.
     * Defaults to current working directory.
     */
    rootDirUrl = String(pathToFileURL(process.cwd())),
): ImportResolverCallback {
    rootDirUrl += rootDirUrl.endsWith('/') ? '' : '/'

    return (resolved, specifier, importerUrl) => {
        const isConstrainHit = (constrain: RegExp[] | ImportResolverConstrain) => (
            typeof constrain === 'function'
                ? constrain(importerPath, importerUrl)
                : constrain.some(r => r.test(importerPath))
        )
        const importerFullPath = String(importerUrl)
        if (!importerFullPath.startsWith(rootDirUrl)) {
            return undefined
        }
        const importerPath = importerFullPath.substring(rootDirUrl.length)
        if (include && !isConstrainHit(include)) {
            return undefined
        } if (exclude && isConstrainHit(exclude)) {
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
            return `node:${id}`
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

        return resolvedId
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
        if (resolved) {
            return undefined
        }

        const require = module.createRequire(importerUrl)
        try {
            return require.resolve(specifier)
        } catch(e) {
            if (catchErrors) {
                return undefined
            }
            throw e
        }
    }
}
