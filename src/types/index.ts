import type { VirtualFS } from '@/fs/VirtualFS'

export interface FileStat {
  name: string
  type: 'file' | 'dir' | 'symlink' | 'char' | 'block' | 'fifo' | 'socket'
  mode: number
  uid: number
  gid: number
  size: number
  atime: number
  mtime: number
  ctime: number
  target?: string
  dev?: string
}

export interface Inode {
  stat: FileStat
  content?: string
  children?: Map<string, Inode>
}

export interface User {
  uid: number
  gid: number
  name: string
  home: string
  shell: string
}

export interface Process {
  pid: number
  ppid: number
  cmd: string
  cwd: string
  env: Record<string, string>
}

export interface ParsedCommand {
  command: string
  args: string[]
  redirectIn?: string
  redirectOut?: string
  redirectOutAppend?: boolean
  redirectErr?: string
  background?: boolean
  pipe?: ParsedCommand[]
  and?: boolean
  or?: boolean
  next?: ParsedCommand
}

export type ShellOperator = '|' | '&&' | '||' | ';' | '&' | '>' | '>>' | '<' | '2>'

export interface ShellToken {
  value: string
  operator?: ShellOperator
}

export interface ShellCommand {
  args: string[]
  redirectIn?: string
  redirectOut?: string
  redirectOutAppend?: boolean
  redirectErr?: string
}

export interface ShellPipeline {
  commands: ShellCommand[]
  condition?: '&&' | '||'
  background?: boolean
}

export interface CommandContext {
  fs: VirtualFS
  env: Record<string, string>
  cwd: string
  uid: number
  gid: number
  pid: number
  history: string[]
  setHistory: (h: string[]) => void
  exitCode: number
  setExitCode: (code: number) => void
  write: (data: string) => void
  error: (data: string) => void
  user: User
  stdin: string
}
