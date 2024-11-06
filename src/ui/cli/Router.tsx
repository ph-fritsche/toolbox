import React, { useMemo, useState } from 'react'
import { createProvidedContext } from '../../util/react/context'

type RouterContext = {
    path: string
    subPath: string
    fullPath: string
    setPath: (path: string) => void
}
const routerContext = createProvidedContext<RouterContext>('RouterProvider')

export function Router({
    children,
}: React.PropsWithChildren) {
    const [path, setPath] = useState('/')

    return <routerContext.Provider value={useMemo(() => ({
        fullPath: path,
        path: '/',
        subPath: path.substring(1),
        setPath,
    }), [
        path,
    ])}>{children}</routerContext.Provider>
}

export function Routes({
    children,
}: {
    children: Array<React.ReactElement<RouteProps>> | React.ReactElement<RouteProps>,
}) {
    const context = routerContext.useContext()

    const routes = Array.isArray(children) ? children : [children]

    let route = undefined, path = context.path, subPath = context.subPath
    for (const r of routes) {
        if (r.type !== Route) {
            continue
        }

        if (r.props.path === '*') {
            //
        } else if (context.subPath === r.props.path) {
            path = normalizePath(context.path, r.props.path)
            subPath = ''
        } else if (context.subPath.startsWith(r.props.path + '/')) {
            path = normalizePath(context.path, r.props.path)
            subPath = context.subPath.substring(r.props.path.length + 1)
        } else {
            continue
        }
        route = r
        break
    }

    return <routerContext.Provider value={useMemo(() => ({
        ...context,
        path,
        subPath,
    }), [
        context,
        path,
        subPath,
    ])}>
        {route?.props.children}
    </routerContext.Provider>
}

type RouteProps = {
    path: string
    children?: React.ReactNode
}

export const Route: (props: RouteProps) => null = () => {
    throw new Error('<Route> must be placed inside <Routes>')
}

export function useRouter() {
    const {fullPath, path, subPath, setPath} = routerContext.useContext()
    return {
        fullPath,
        path,
        subPath,
        navigate: (p: string) => setPath(normalizePath(path, p)),
    }
}

function normalizePath(
    ...paths: string[]
) {
    let result = []
    for (const path of paths) {
        if (path.startsWith('/')) {
            result = []
        } else if (path.startsWith('./') || path.startsWith('../')) {
            result.pop()
        }
        for (const p of path.split('/')) {
            if (p === '' || p === '.') {
                continue
            } else if (p === '..') {
                result.pop()
            } else {
                result.push(p)
            }
        }
    }
    return '/' + result.join('/')
}
