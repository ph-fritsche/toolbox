import path from 'path'
import ts from 'typescript'

type tsConfig = {
    extends?: string
    compilerOptions?: ts.CompilerOptions
}

function readTsConfig(file: string): tsConfig {
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const config = ts.readConfigFile(file, ts.sys.readFile).config as tsConfig
    const extended = config.extends
        ? readTsConfig(path.resolve(path.dirname(file), config.extends))
        : {}

    return {
        ...extended,
        ...config,
        compilerOptions: {
            ...extended.compilerOptions,
            ...config.compilerOptions,
        }
    }
}

export function parseTsConfig(configFile: string) {
    const config = readTsConfig(configFile)
    const compilerOptions = ts.convertCompilerOptionsFromJson(config.compilerOptions, './tests', configFile).options
    const baseUrl = path.resolve(compilerOptions.baseUrl ?? '.')

    return {
        config,
        compilerOptions,
        baseUrl,
    }
}
