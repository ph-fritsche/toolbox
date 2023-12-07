import path from 'node:path'
import ts from 'typescript'
import { SyncFilesystem } from '../files/Filesystem'

export class TsModuleResolver {
    constructor(
        protected readonly fs: SyncFilesystem,
    ) {
        this.tsModuleResolutionHost = {
            fileExists: s => this.fs.existsSync(s),
            readFile: s => this.fs.readFileSync(s).toString('utf8'),
        }
    }

    protected readonly resolved: Record<string, string|undefined> = {}

    protected readonly tsModuleResolutionHost: ts.ModuleResolutionHost

    resolveModule(
        name: string,
        importer: string,
        compilerOptions: ts.CompilerOptions,
        /** Whether the module is imported per `require` or `import`. */
        resolutionMode?: ts.ResolutionMode,
        /** Resolve to type declaration. */
        resolveDts = false,
    ) {
        const key = [
            name,
            path.dirname(importer),
            // The parsed compilerOptions include a `pathsBasePath` property.
            String(compilerOptions.pathsBasePath),
            JSON.stringify(compilerOptions.paths),
            Number(compilerOptions.moduleResolution),
            Number(resolutionMode),
            Number(resolveDts),
        ].join(path.delimiter)

        if (!(key in this.resolved)) {
            const {resolvedModule} = ts.resolveModuleName(
                name,
                importer,
                {...compilerOptions, noDtsResolution: !resolveDts},
                this.tsModuleResolutionHost,
                // The tsModuleResolutionCache uses the directory and resolutionMode as index.
                // If compilerOptions or available files change, this yields invalid results.
                // There is no API to partially invalidate the tsModuleResolutionCache.
                undefined,
                undefined,
                resolutionMode,
            )

            this.resolved[key] = resolvedModule?.resolvedFileName
        }

        return this.resolved[key]
    }
}
