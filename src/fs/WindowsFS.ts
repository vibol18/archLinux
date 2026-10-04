import type { Inode } from '@/types'

interface SerializedInode {
  stat: Inode['stat']
  content?: string
  children?: Array<[string, SerializedInode]>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function deserializeNode(value: unknown): Inode | null {
  if (!isRecord(value) || !isRecord(value.stat)) return null
  const stat = value.stat
  const validTypes = ['file', 'dir', 'symlink', 'char', 'block', 'fifo', 'socket']
  if (typeof stat.name !== 'string' || typeof stat.type !== 'string' || !validTypes.includes(stat.type)) return null
  if (typeof stat.mode !== 'number' || typeof stat.uid !== 'number' || typeof stat.gid !== 'number' || typeof stat.size !== 'number') return null
  if (typeof stat.atime !== 'number' || typeof stat.mtime !== 'number' || typeof stat.ctime !== 'number') return null
  const nodeStat: Inode['stat'] = {
    name: stat.name,
    type: stat.type as Inode['stat']['type'],
    mode: stat.mode,
    uid: stat.uid,
    gid: stat.gid,
    size: stat.size,
    atime: stat.atime,
    mtime: stat.mtime,
    ctime: stat.ctime
  }
  if (typeof stat.target === 'string') nodeStat.target = stat.target
  if (typeof stat.dev === 'string') nodeStat.dev = stat.dev
  const node: Inode = { stat: nodeStat }
  if (typeof value.content === 'string') node.content = value.content
  if (Array.isArray(value.children)) {
    node.children = new Map()
    for (const entry of value.children) {
      if (!Array.isArray(entry) || typeof entry[0] !== 'string') return null
      const child = deserializeNode(entry[1])
      if (!child) return null
      node.children.set(entry[0], child)
    }
  }
  return node
}

export class WindowsFS {
  private root: Inode
  private cwd = 'C:\Users\Student'

  constructor() {
    this.root = this.createDir('C:', 0, 0)
    this.initialize()
  }

  private createDir(name: string, uid: number, gid: number, mode = 0o755): Inode {
    return {
      stat: {
        name,
        type: 'dir',
        mode,
        uid,
        gid,
        size: 0,
        atime: Date.now(),
        mtime: Date.now(),
        ctime: Date.now()
      },
      children: new Map()
    }
  }

  private createFile(name: string, uid: number, gid: number, content = '', mode = 0o644): Inode {
    return {
      stat: {
        name,
        type: 'file',
        mode,
        uid,
        gid,
        size: content.length,
        atime: Date.now(),
        mtime: Date.now(),
        ctime: Date.now()
      },
      content
    }
  }

  private normalizePath(path: string): string {
    if (!path) return this.cwd
    let normalized = path.replace(/\//g, '\')
    if (/^[A-Za-z]:$/.test(normalized)) return normalized + '\'
    if (/^[A-Za-z]:\?$/.test(normalized)) return normalized.replace(/\?$/, '\')
    if (!normalized.includes(':')) {
      const full = this.cwd.endsWith('\') ? this.cwd + normalized : this.cwd + '\' + normalized
      normalized = full
    }
    const drive = normalized.match(/^([A-Za-z]:)/)?.[1]
    let rest = normalized.slice(drive ? drive.length : 0)
    const parts = rest.split('\').filter(p => p && p !== '.')
    const stack: string[] = []
    for (const p of parts) {
      if (p === '..') stack.pop()
      else stack.push(p)
    }
    const result = (drive || 'C:') + '\' + stack.join('\')
    return result === 'C:\' ? 'C:\' : result.replace(/\\$/, '\')
  }

  getCurrentDirectory(): string {
    return this.cwd
  }

  setCwd(cwd: string): void {
    this.cwd = this.normalizePath(cwd)
  }

  exists(path: string): boolean {
    return this.findNode(path) !== null
  }

  hasPermission(): boolean {
    return true
  }

  private findNode(path: string): Inode | null {
    const normalized = this.normalizePath(path)
    if (normalized === 'C:\') return this.root.children?.get('C:') ?? null
    const parts = normalized.replace(/^C:\/, '').split('\').filter(p => p)
    let current = this.root.children?.get('C:')
    if (!current) return null
    for (const p of parts) {
      const child = Array.from(current.children?.values() || []).find(c => c.stat.name.toLowerCase() === p.toLowerCase())
      if (!child) return null
      current = child
    }
    return current
  }

  private getParent(path: string): Inode | null {
    const normalized = this.normalizePath(path)
    const withoutDrive = normalized.replace(/^C:\/, '')
    if (!withoutDrive) return null
    const parts = withoutDrive.split('\').filter(p => p)
    if (parts.length <= 1) return this.root.children?.get('C:') ?? null
    parts.pop()
    return this.findNode('C:\' + parts.join('\'))
  }

  getNode(path: string): Inode | null {
    return this.findNode(path)
  }

  changeDirectory(path: string): boolean {
    const node = this.findNode(path)
    if (!node || node.stat.type !== 'dir') return false
    this.cwd = this.normalizePath(path)
    return true
  }

  mkdir(path: string, uid: number, gid: number): boolean {
    const parent = this.getParent(path)
    if (!parent || !parent.children) return false
    const name = path.split('\').filter(p => p).pop() || 'new'
    if (Array.from(parent.children.values()).some(c => c.stat.name.toLowerCase() === name.toLowerCase())) return false
    parent.children.set(name, this.createDir(name, uid, gid))
    return true
  }

  mkdirRecursive(path: string, uid: number, gid: number): boolean {
    const normalized = this.normalizePath(path)
    const parts = normalized.replace(/^C:\/, '').split('\').filter(p => p)
    let currentPath = 'C:\'
    for (const p of parts) {
      currentPath = currentPath.endsWith('\') ? currentPath + p : currentPath + '\' + p
      if (!this.exists(currentPath)) {
        this.mkdir(currentPath, uid, gid)
      }
    }
    return true
  }

  writeFile(path: string, content: string, uid: number, gid: number): boolean {
    const parent = this.getParent(path)
    if (!parent || !parent.children) return false
    const name = path.split('\').filter(p => p).pop() || 'file.txt'
    const existing = Array.from(parent.children.values()).find(c => c.stat.name.toLowerCase() === name.toLowerCase())
    if (existing) {
      existing.content = content
      existing.stat.size = content.length
      existing.stat.mtime = Date.now()
      return true
    }
    parent.children.set(name, this.createFile(name, uid, gid, content))
    return true
  }

  remove(path: string): boolean {
    const node = this.findNode(path)
    if (!node) return false
    const parent = this.getParent(path)
    if (!parent || !parent.children) return false
    const name = node.stat.name
    parent.children.delete(name)
    return true
  }

  copy(src: string, dest: string): boolean {
    const node = this.findNode(src)
    if (!node) return false
    return this.writeFile(dest, node.content || '', 1000, 1000)
  }

  move(src: string, dest: string): boolean {
    if (!this.copy(src, dest)) return false
    this.remove(src)
    return true
  }

  initialize() {
    const cDrive = this.createDir('C:', 0, 0)
    this.root.children = new Map()
    this.root.children.set('C:', cDrive)
    this.mkdirRecursive('C:\Windows', 0, 0)
    this.mkdirRecursive('C:\Windows\System32', 0, 0)
    this.mkdirRecursive('C:\Users\Student', 1000, 1000)
    this.mkdirRecursive('C:\Users\Student\Desktop', 1000, 1000)
    this.mkdirRecursive('C:\Users\Student\Documents', 1000, 1000)
    this.mkdirRecursive('C:\Users\Student\Downloads', 1000, 1000)
    this.mkdirRecursive('C:\Program Files', 0, 0)
    this.mkdirRecursive('C:\Temp', 0, 0)
    this.writeFile('C:\Users\Student\Desktop\readme.txt', 'Welcome to Windows 11 simulation in ArchLab\r\n', 1000, 1000)
  }

  serialize(): string {
    const serializeNode = (node: Inode): SerializedInode => {
      const serialized: SerializedInode = { stat: { ...node.stat } }
      if (typeof node.content === 'string') serialized.content = node.content
      if (node.children) {
        serialized.children = []
        for (const [key, child] of node.children) {
          serialized.children.push([key, serializeNode(child)])
        }
      }
      return serialized
    }
    re
