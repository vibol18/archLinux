import { describe, expect, it } from 'vitest'
import { VirtualFS } from './VirtualFS'

describe('VirtualFS', () => {
  it('starts at the learner home and resolves relative paths', () => {
    const fs = new VirtualFS()
    expect(fs.getCurrentDirectory()).toBe('/home/archuser')
    expect(fs.writeFile('note.txt', 'hello', 1000, 1000)).toBe(true)
    expect(fs.getNode('/home/archuser/note.txt')?.content).toBe('hello')
  })

  it('creates parents, moves nodes, and removes directories recursively', () => {
    const fs = new VirtualFS()
    expect(fs.mkdirRecursive('projects/lab', 1000, 1000)).toBe(true)
    expect(fs.writeFile('projects/lab/a.txt', 'x', 1000, 1000)).toBe(true)
    expect(fs.move('projects/lab/a.txt', 'projects/lab/b.txt')).toBe(true)
    expect(fs.getNode('projects/lab/b.txt')?.content).toBe('x')
    expect(fs.remove('projects', true)).toBe(true)
    expect(fs.exists('projects')).toBe(false)
  })

  it('copies files without changing the source', () => {
    const fs = new VirtualFS()
    fs.writeFile('source.txt', 'content', 1000, 1000)
    expect(fs.copy('source.txt', 'copy.txt')).toBe(true)
    expect(fs.getNode('source.txt')?.content).toBe('content')
    expect(fs.getNode('copy.txt')?.content).toBe('content')
  })

  it('restores a serialized tree and working directory', () => {
    const original = new VirtualFS()
    original.mkdir('work', 1000, 1000)
    original.writeFile('work/note.txt', 'persisted', 1000, 1000)
    original.changeDirectory('work')
    const restored = new VirtualFS()
    expect(restored.restore(original.serialize())).toBe(true)
    expect(restored.getCurrentDirectory()).toBe('/home/archuser/work')
    expect(restored.getNode('note.txt')?.content).toBe('persisted')
  })
})