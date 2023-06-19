import { ModuleMocker } from 'jest-mock'
import { expect } from 'expect'

Object.assign(global, {
    mock: new ModuleMocker(global),
    expect,
})
