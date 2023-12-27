import { setupSourceModuleLoader } from '#src'
import { FileProvider } from '#src/files'
import { HttpFileServer } from '#src/server'

export async function setupToolboxRunner() {
    const server = new HttpFileServer(new FileProvider([
        await setupSourceModuleLoader({
            instrument: false,
            filesImports: [/(^|\/)node_modules\//],
        }),
    ]))
    return {
        url: String(await server.url) + 'src/runner/index.ts',
        close: () => server.close(),
    }
}
