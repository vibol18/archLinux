import type { Inode } from '@/types'

interface SerializedInode {
  stat: Inode['stat']
  content?: string
  children?: Array<[string, SerializedInode]>
}

interface SerializedFileSystem {
  cwd: string
  root: SerializedInode
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

export class VirtualFS {
  private root: Inode
  private cwd = '/home/archuser'

  constructor() {
    this.root = this.createDir('/', 0, 0)
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

  private createDevice(name: string, type: Inode['stat']['type'], uid: number, gid: number, mode: number, dev?: string): Inode {
    return {
      stat: { name, type, mode, uid, gid, size: 0, atime: Date.now(), mtime: Date.now(), ctime: Date.now(), dev },
      content: ''
    }
  }

  private dirname(path: string): string {
    const parts = path.split('/').filter(p => p)
    if (parts.length === 0) return '/'
    parts.pop()
    return parts.length === 0 ? '/' : '/' + parts.join('/')
  }

  private basename(path: string): string {
    const parts = path.split('/').filter(p => p)
    return parts[parts.length - 1] || '/'
  }

  private normalizePath(path: string, cwd: string = this.cwd): string {
    if (!path) return cwd
    if (path.startsWith('/')) {
      const parts = path.split('/').filter(p => p && p !== '.')
      const stack: string[] = []
      for (const p of parts) {
        if (p === '..') {
          stack.pop()
        } else {
          stack.push(p)
        }
      }
      return '/' + stack.join('/')
    } else {
      const full = cwd === '/' ? '/' + path : cwd + '/' + path
      return this.normalizePath(full)
    }
  }

  private findNode(path: string): Inode | null {
    if (path === '/') return this.root
    const parts = path.split('/').filter(p => p)
    let current = this.root
    for (const p of parts) {
      if (!current.children || !current.children.has(p)) return null
      current = current.children.get(p)!
    }
    return current
  }

  private getParent(path: string): Inode | null {
    return this.findNode(this.dirname(path))
  }

  initialize() {
    this.mkdir('/etc', 0, 0)
    this.mkdir('/home', 0, 0)
    this.mkdir('/home/archuser', 1000, 1000)
    this.mkdir('/usr', 0, 0)
    this.mkdir('/usr/bin', 0, 0)
    this.mkdir('/usr/sbin', 0, 0)
    this.mkdir('/var', 0, 0)
    this.mkdir('/var/log', 0, 0)
    this.mkdir('/var/cache', 0, 0)
    this.mkdir('/var/cache/pacman', 0, 0)
    this.mkdir('/var/cache/pacman/pkg', 0, 0)
    this.mkdir('/proc', 0, 0)
    this.mkdir('/dev', 0, 0)
    this.mkdir('/tmp', 0, 0, 0o1777)
    this.mkdir('/boot', 0, 0)
    this.mkdir('/mnt', 0, 0)
    this.mkdir('/usr/local', 0, 0)
    this.mkdir('/usr/local/bin', 0, 0)
    this.mkdir('/usr/local/sbin', 0, 0)
    this.mkdir('/root', 0, 0)
    this.mkdir('/opt', 0, 0)

    const devDir = this.findNode('/dev')
    if (devDir?.children) {
      devDir.children.set('null', this.createDevice('null', 'char', 0, 0, 0o666, 'c:1:3'))
      devDir.children.set('zero', this.createDevice('zero', 'char', 0, 0, 0o666, 'c:1:5'))
      devDir.children.set('tty', this.createDevice('tty', 'char', 0, 0, 0o666, 'c:5:0'))
      devDir.children.set('pts', this.createDir('pts', 0, 0))
    }

    this.writeFile('/etc/hostname', 'archlinux', 0, 0)
    this.writeFile('/etc/os-release', `NAME="Arch Linux"
PRETTY_NAME="Arch Linux"
ID=arch
BUILD_ID=rolling
ANSI_COLOR="38;2;23;147;209"
HOME_URL="https://archlinux.org/"
`, 0, 0)
    this.writeFile('/etc/passwd', `root:x:0:0:root:/root:/bin/bash
archuser:x:1000:1000:Arch User:/home/archuser:/bin/bash
`, 0, 0)
    this.writeFile('/etc/group', `root:x:0:
wheel:x:10:root,archuser
users:x:100:
`, 0, 0)
    this.writeFile('/etc/hosts', `127.0.0.1 localhost
::1 localhost
127.0.1.1 archlinux
`, 0, 0)
    this.writeFile('/etc/fstab', `# Static information about the filesystems
`, 0, 0)
    this.writeFile('/etc/pacman.conf', `[options]
HoldPkg = pacman glibc
Architecture = auto
CheckSpace
SigLevel = Required DatabaseOptional
LocalFileSigLevel = Optional

[core]
Include = /etc/pacman.d/mirrorlist

[extra]
Include = /etc/pacman.d/mirrorlist
`, 0, 0)
    this.mkdir('/etc/pacman.d', 0, 0)
    this.writeFile('/etc/pacman.d/mirrorlist', `Server = https://geo.mirror.pkgbuild.com/$repo/os/$arch
`, 0, 0)

    this.writeFile('/usr/bin/true', '#!/bin/sh\nexit 0', 0, 0, 0o755)
    this.writeFile('/usr/bin/false', '#!/bin/sh\nexit 1', 0, 0, 0o755)
    this.writeFile('/bin/bash', '#!/bin/sh', 0, 0, 0o755)
  }

  mkdir(path: string, uid: number, gid: number, mode = 0o755): boolean {
    const full = this.normalizePath(path)
    const name = this.basename(full)
    const pNode = this.getParent(full)
    if (!pNode || pNode.stat.type !== 'dir') return false
    if (pNode.children?.has(name)) return false
    if (pNode.children) {
      pNode.children.set(name, this.createDir(name, uid, gid, mode))
    }
    return true
  }

  mkdirRecursive(path: string, uid: number, gid: number, mode = 0o755): boolean {
    const full = this.normalizePath(path)
    const parts = full.split('/').filter(Boolean)
    let current = ''
    for (const part of parts) {
      current += `/${part}`
      if (!this.exists(current) && !this.mkdir(current, uid, gid, mode)) return false
    }
    return true
  }

  writeFile(path: string, content: string, uid: number, gid: number, mode = 0o644): boolean {
    const full = this.normalizePath(path)
    const name = this.basename(full)
    const pNode = this.getParent(full)
    if (!pNode || pNode.stat.type !== 'dir') return false
    const node = this.createFile(name, uid, gid, content, mode)
    if (pNode.children) {
      pNode.children.set(name, node)
    }
    return true
  }

  symlink(target: string, linkPath: string, uid: number, gid: number): boolean {
    const full = this.normalizePath(linkPath)
    const name = this.basename(full)
    const pNode = this.getParent(full)
    if (!pNode || pNode.stat.type !== 'dir') return false
    if (pNode.children) {
      pNode.children.set(name, {
        stat: { name, type: 'symlink', mode: 0o777, uid, gid, size: 0, atime: Date.now(), mtime: Date.now(), ctime: Date.now(), target },
        content: target
      })
    }
    return true
  }

  listDirectory(path = '.'): Inode[] | null {
    const node = this.getNode(path)
    if (!node || node.stat.type !== 'dir' || !node.children) return null
    return [...node.children.values()]
  }

  remove(path: string, recursive = false): boolean {
    const full = this.normalizePath(path)
    if (full === '/') return false
    const node = this.findNode(full)
    if (!node || (node.stat.type === 'dir' && node.children?.size && !recursive)) return false
    const parent = this.getParent(full)
    return parent?.children?.delete(node.stat.name) ?? false
  }

  copy(source: string, destination: string, recursive = false): boolean {
    const sourceNode = this.getNode(source)
    if (!sourceNode || (sourceNode.stat.type === 'dir' && !recursive)) return false
    const clone = (node: Inode): Inode => ({
      stat: { ...node.stat, name: node.stat.name, ctime: Date.now(), mtime: Date.now() },
      content: node.content,
      children: node.children ? new Map([...node.children].map(([name, child]) => [name, clone(child)])) : undefined
    })
    const fullDestination = this.normalizePath(destination)
    const existing = this.findNode(fullDestination)
    const target = existing?.stat.type === 'dir' ? `${fullDestination}/${sourceNode.stat.name}` : fullDestination
    const parent = this.getParent(target)
    if (!parent?.children || parent.children.has(this.basename(target))) return false
    const copied = clone(sourceNode)
    copied.stat.name = this.basename(target)
    parent.children.set(copied.stat.name, copied)
    return true
  }

  move(source: string, destination: string): boolean {
    const fullSource = this.normalizePath(source)
    const sourceNode = this.findNode(fullSource)
    if (!sourceNode || fullSource === '/') return false
    const fullDestination = this.normalizePath(destination)
    const existing = this.findNode(fullDestination)
    const target = existing?.stat.type === 'dir' ? `${fullDestination}/${sourceNode.stat.name}` : fullDestination
    const targetParent = this.getParent(target)
    if (!targetParent?.children || targetParent.children.has(this.basename(target))) return false
    const sourceParent = this.getParent(fullSource)
    if (!sourceParent?.children?.delete(sourceNode.stat.name)) return false
    sourceNode.stat.name = this.basename(target)
    targetParent.children.set(sourceNode.stat.name, sourceNode)
    return true
  }

  changeMode(path: string, mode: number, uid: number): boolean {
    const node = this.getNode(path)
    if (!node || (uid !== 0 && node.stat.uid !== uid)) return false
    node.stat.mode = mode & 0o7777
    node.stat.ctime = Date.now()
    return true
  }

  hasPermission(path: string, uid: number, gid: number, permission: 'read' | 'write' | 'execute'): boolean {
    if (uid === 0) return true
    const full = this.normalizePath(path)
    let current = this.root
    for (const part of full.split('/').filter(Boolean)) {
      const executeBits = current.stat.uid === uid ? (current.stat.mode >> 6) & 0o7 : current.stat.gid === gid ? (current.stat.mode >> 3) & 0o7 : current.stat.mode & 0o7
      if ((executeBits & 0o1) === 0) return false
      const next = current.children?.get(part)
      if (!next) return false
      current = next
    }
    const bits = current.stat.uid === uid ? (current.stat.mode >> 6) & 0o7 : current.stat.gid === gid ? (current.stat.mode >> 3) & 0o7 : current.stat.mode & 0o7
    const required = permission === 'read' ? 0o4 : permission === 'write' ? 0o2 : 0o1
    return (bits & required) !== 0
  }

  exists(path: string): boolean {
    return this.findNode(this.normalizePath(path)) !== null
  }

  getNode(path: string): Inode | null {
    return this.findNode(this.normalizePath(path))
  }

  getCurrentDirectory(): string {
    return this.cwd
  }

  changeDirectory(path: string): boolean {
    const node = this.getNode(path || '/home/archuser')
    if (!node || node.stat.type !== 'dir') return false
    this.cwd = this.normalizePath(path || '/home/archuser')
    return true
  }

  serialize(): string {
    const serializeNode = (node: Inode): SerializedInode => ({
      stat: node.stat,
      content: node.content,
      children: node.children ? [...node.children].map(([name, child]) => [name, serializeNode(child)]) : undefined
    })
    return JSON.stringify({ cwd: this.cwd, root: serializeNode(this.root) } satisfies SerializedFileSystem)
  }

  restore(snapshot: string): boolean {
    try {
      const data: unknown = JSON.parse(snapshot)
      if (!isRecord(data) || typeof data.cwd !== 'string') return false
      const root = deserializeNode(data.root)
      if (!root || root.stat.type !== 'dir') return false
      const previousRoot = this.root
      this.root = root
      if (!this.getNode(data.cwd) || this.getNode(data.cwd)?.stat.type !== 'dir') {
        this.root = previousRoot
        return false
      }
      this.cwd = data.cwd
      return true
    } catch {
      return false
    }
  }
}
