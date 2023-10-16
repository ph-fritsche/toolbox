export async function Loader(moduleId: string) {
    const defaultExport: unknown = await import(moduleId)
    if (typeof defaultExport === 'function') {
        await defaultExport()
    }
}
