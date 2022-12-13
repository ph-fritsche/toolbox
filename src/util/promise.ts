export function promise<T>() {
    let resolve: (value: T) => void
    let reject: (reason: unknown) => void
    return {
        Promise: new Promise<T>((res, rej) => {
            resolve = res
            reject = rej
        }),
        resolve,
        reject,
    }
}
