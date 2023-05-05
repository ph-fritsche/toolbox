const unassigned = () => {throw new Error('Uninitialized')}
export function promise<T>() {
    let resolve: (value: T) => void = unassigned
    let reject: (reason: unknown) => void = unassigned
    return {
        Promise: new Promise<T>((res, rej) => {
            resolve = res
            reject = rej
        }),
        resolve,
        reject,
    }
}
