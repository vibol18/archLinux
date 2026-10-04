import { beforeEach, describe, expect, it } from 'vitest'
import { executeCommand } from './index'
import { VirtualFS } from '@/fs/VirtualFS'
import type { CommandContext } from '@/types'

describe('core commands', () => {
  let context: CommandContext
  let output: string
  let error: string

  beforeEach(() => {
    const fs = new VirtualFS()
    output = ''
    error = ''
    context = {
      fs,
      env: { HOME: '/home/archuser', PATH: '/usr/bin:/bin' },
      cwd: fs.getCurrentDirectory(),
      uid: 1000,
      gid: 1000,
      pid: 1,
      history: [],
      setHistory: () => undefined,
      exitCode: 0,
      setExitCode: () => undefined,
      write: text => { output += text },
      error: text => { error += text },
      user: { uid: 1000, gid: 1000, name: 'archuser', home: '/home/archuser', shell: '/bin/bash' },
      stdin: ''
    }
  })

  it.each([
    ['pwd', [], '/home/archuser\n'],
    ['whoami', [], 'archuser\n'],
    ['uname', ['-a'], 'Linux archlinux 6.12.8-arch1-1 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n'],
    ['echo', ['hello', 'there'], 'hello there\n'],
    ['cat', ['/etc/hostname'], 'archlinux'],
    ['ls', ['/etc'], 'fstab'],
    ['help', [], 'ArchLab commands:']
  ])('runs %s', async (command, args, expected) => {
    const status = await executeCommand(command, args, context)
    expect(status).toBe(0)
    expect(output).toContain(expected)
  })

  it('creates and reads files through touch, redirection-compatible writes, and cat', async () => {
    expect(await executeCommand('mkdir', ['-p', 'work/notes'], context)).toBe(0)
    expect(await executeCommand('touch', ['work/notes/today.txt'], context)).toBe(0)
    context.fs.writeFile('work/notes/today.txt', 'practice\n', 1000, 1000)
    expect(await executeCommand('cat', ['work/notes/today.txt'], context)).toBe(0)
    expect(output).toContain('practice\n')
  })

  it('copies, renames, changes mode, and removes a file', async () => {
    context.fs.writeFile('before.txt', 'data', 1000, 1000)
    expect(await executeCommand('cp', ['before.txt', 'copy.txt'], context)).toBe(0)
    expect(await executeCommand('mv', ['copy.txt', 'renamed.txt'], context)).toBe(0)
    expect(await executeCommand('chmod', ['600', 'renamed.txt'], context)).toBe(0)
    expect(context.fs.getNode('renamed.txt')?.stat.mode).toBe(0o600)
    expect(await executeCommand('rm', ['renamed.txt'], context)).toBe(0)
    expect(context.fs.exists('renamed.txt')).toBe(false)
  })

  it('returns a shell-style error for an unknown command', async () => {
    expect(await executeCommand('not-a-command', [], context)).toBe(127)
    expect(error).toBe('bash: not-a-command: command not found\n')
  })

  it('denies reads blocked by mode bits but permits root access', async () => {
    context.fs.writeFile('/etc/locked.conf', 'secret', 0, 0, 0o600)
    expect(await executeCommand('cat', ['/etc/locked.conf'], context)).toBe(1)
    expect(error).toContain('Permission denied')
    context.uid = 0
    expect(await executeCommand('cat', ['/etc/locked.conf'], context)).toBe(0)
    expect(output).toContain('secret')
  })
})