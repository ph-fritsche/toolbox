import path from 'node:path'
import ts from 'typescript'
import { Filesystem } from './Filesystem'

export class TsConfigResolver {
    constructor(
        protected readonly fs: Filesystem,
    ) {
        this.tsResolutionHost = {
            fileExists: s => this.fs.existsSync(s),
            readDirectory: () => [],
            readFile: s => this.fs.readFileSync(s).toString('utf8'),
            useCaseSensitiveFileNames: this.fs.caseSensitive,
        }
    }
    protected readonly location: Record<string, string|undefined> = {}
    protected readonly resolved: Record<string, ts.CompilerOptions> = {}

    protected readonly tsResolutionHost: ts.ParseConfigHost
    protected readonly tsExtendedConfigCache = new Map<string, ts.ExtendedConfigCacheEntry>()

    findConfig(
        dirPath: string,
        configName = 'tsconfig.json',
    ) {
        const key = dirPath + path.delimiter + configName

        if (!(key in this.location)) {
            this.location[key] = ts.findConfigFile(dirPath, s => this.fs.existsSync(s), configName)
        }

        return this.location[key]
    }

    getCompilerOptions(
        dirPath: string,
        configName = 'tsconfig.json',
    ) {
        const configPath = this.findConfig(dirPath, configName)
        if (!configPath) {
            throw `Typescript config ${configName} for ${dirPath} could not be found.`
        }

        if (!(configPath in this.resolved)) {
            const configText = this.fs.readFileSync(configPath).toString('utf8')
            const parsed = ts.parseConfigFileTextToJson(configPath, configText)

            if (parsed.error) {
                throw parsed.error
            }

            const resolved = ts.parseJsonConfigFileContent(
                parsed.config,
                this.tsResolutionHost,
                path.dirname(configPath),
                undefined,
                configPath,
                undefined,
                undefined,
                this.tsExtendedConfigCache,
                undefined,
            )
            this.resolved[configPath] = resolved.options
        }

        return this.resolved[configPath]
    }
}
