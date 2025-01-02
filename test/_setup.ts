import { setupSourceModuleLoader } from '#src'
import { SourceLocationResolver } from '#src/error/ErrorStackResolver'
import { SourceMapResolver } from '#src/error/SourceMapResolver'
import { FileProvider } from '#src/files'
import { HttpFileServer } from '#src/server'

export async function setupToolboxRunner() {
    const server = new HttpFileServer(new FileProvider([
        await setupSourceModuleLoader({
            instrument: false,
            filesImports: [/(^|\/)node_modules\//],
        }),
    ]))
    const serverUrl = String(await server.url)
    const resolver = new SourceMapResolver(serverUrl, server.provider)
    const resolve: SourceLocationResolver['resolve'] = loc => resolver.resolve(loc)
    return {
        url: serverUrl + 'src/runner/index.ts',
        close: () => server.close(),
        resolve,
    }
}
