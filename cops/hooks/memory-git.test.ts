import { describe, expect, test } from 'claude-code/testing'
import { describeMemoryGit, parseMemoryGit } from './memory-git.ts'

describe('parseMemoryGit', () => {
  test('clean', () => {
    expect(parseMemoryGit({ porcelain: '', ahead: '0\n' })).toEqual({ uncommitted: 0, unpushed: 0 })
  })

  test('uncommitted', () => {
    expect(parseMemoryGit({ porcelain: ' M a.md\n?? b.md\n', ahead: '0\n' })).toEqual({ uncommitted: 2, unpushed: 0 })
  })

  test('unpushed', () => {
    expect(parseMemoryGit({ porcelain: '', ahead: '2\n' })).toEqual({ uncommitted: 0, unpushed: 2 })
  })

  test('no upstream', () => {
    expect(parseMemoryGit({ porcelain: ' M a.md\n' })).toEqual({ uncommitted: 1 })
    expect(parseMemoryGit({ porcelain: '', ahead: 'oops' })).toEqual({ uncommitted: 0 })
  })
})

describe('describeMemoryGit', () => {
  test('leaves out zero and unknown counts', () => {
    expect(describeMemoryGit({ git: { uncommitted: 1, unpushed: 2 } })).toBe(' · 1 uncommitted · 2 unpushed')
    expect(describeMemoryGit({ git: { uncommitted: 0, unpushed: 0 } })).toBe('')
    expect(describeMemoryGit({ git: { uncommitted: 3 } })).toBe(' · 3 uncommitted')
    expect(describeMemoryGit({})).toBe('')
  })
})
