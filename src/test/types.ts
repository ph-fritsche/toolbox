// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Callable = (...args: any[]) => any
export type Serializable<T> = {
    [k in keyof T as T[k] extends Callable ? never : k]: T[k]
}
