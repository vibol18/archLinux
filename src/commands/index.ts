import type { CommandContext } from '@/types'

function pathsFrom(args: string[]): string[] {
  return args.filter(argument => !argument.startsWith('-'))
}

function parentPath(path: string): string {
  const separator = path.lastIndexOf('/')
  if (separator < 0) return '.'
  return separator === 0 ? '/' : path.slice(0, separator)
}

function canCreateAt(ctx: CommandContext, path: string): boolean {
  let parent = parentPath(path)
  while (!ctx.fs.exists(parent) && parent !== '/') parent = parentPath(parent)
  return ctx.fs.hasPermission(parent, ctx.uid, ctx.gid, 'write') && ctx.fs.hasPermission(parent, ctx.uid, ctx.gid, 'execute')
}

function globPattern(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

function collectFiles(ctx: CommandContext, path: string, recursive: boolean): string[] {
  const node = ctx.fs.getNode(path)
  if (!node) return []
  if (node.stat.type !== 'dir') return [path]
  if (!recursive || !node.children) return []
  return [...node.children.values()].flatMap(child => {
    const childPath = `${path.replace(/\/$/, '')}/${child.stat.name}`
    return child.stat.type === 'dir' ? collectFiles(ctx, childPath, true) : [childPath]
  })
}

export async function executeCommand(cmd: string, args: string[], ctx: CommandContext): Promise<number> {
  const command = cmd.toLowerCase()
  switch (command) {
    case 'echo':
      ctx.write(args.join(' ') + '\n')
      return 0
    case 'pwd':
      ctx.write(ctx.cwd + '\n')
      return 0
    case 'cd': {
      const destination = args[0] ?? ctx.env.HOME ?? '/home/archuser'
      if (!ctx.fs.hasPermission(destination, ctx.uid, ctx.gid, 'execute') || !ctx.fs.changeDirectory(destination)) {
        ctx.error(`bash: cd: ${destination}: No such file or directory\n`)
        return 1
      }
      return 0
    }
    case 'whoami':
      ctx.write(ctx.user.name + '\n')
      return 0
    case 'uname':
      ctx.write(args.includes('-a') ? 'Linux archlinux 6.12.8-arch1-1 #1 SMP PREEMPT_DYNAMIC x86_64 GNU/Linux\n' : 'Linux\n')
      return 0
    case 'hostname':
      ctx.write('archlinux\n')
      return 0
    case 'date':
      ctx.write(`${new Date().toString()}\n`)
      return 0
    case 'env':
      ctx.write(Object.entries(ctx.env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n')
      return 0
    case 'which': {
      const target = args[0]
      const location = target ? ctx.env.PATH?.split(':').map(path => `${path}/${target}`).find(path => ctx.fs.exists(path)) : undefined
      if (!location) {
        if (target) ctx.error(`${target} not found\n`)
        return target ? 1 : 0
      }
      ctx.write(`${location}\n`)
      return 0
    }
    case 'cat': {
      let status = 0
      if (args.length === 0) {
        ctx.write(ctx.stdin)
        return 0
      }
      for (const path of args) {
        const node = ctx.fs.getNode(path)
        if (!node) {
          ctx.error(`cat: ${path}: No such file or directory\n`)
          status = 1
        } else if (!ctx.fs.hasPermission(path, ctx.uid, ctx.gid, 'read')) {
          ctx.error(`cat: ${path}: Permission denied\n`)
          status = 1
        } else if (node.stat.type === 'dir') {
          ctx.error(`cat: ${path}: Is a directory\n`)
          status = 1
        } else {
          ctx.write(node.content ?? '')
        }
      }
      return status
    }
    case 'ls': {
      const paths = pathsFrom(args)
      const path = paths[0] ?? ctx.cwd
      const node = ctx.fs.getNode(path)
      if (!node) {
        ctx.error(`ls: cannot access '${path}': No such file or directory\n`)
        return 2
      }
      if (!ctx.fs.hasPermission(path, ctx.uid, ctx.gid, 'read') || (node.stat.type === 'dir' && !ctx.fs.hasPermission(path, ctx.uid, ctx.gid, 'execute'))) {
        ctx.error(`ls: cannot open directory '${path}': Permission denied\n`)
        return 2
      }
      const showAll = args.some(argument => argument.includes('a'))
      const long = args.some(argument => argument.includes('l'))
      const recursive = args.some(argument => argument.includes('R'))
      const entries = node.stat.type === 'dir' && node.children
        ? [...node.children.values()].filter(entry => showAll || !entry.stat.name.startsWith('.')).sort((left, right) => left.stat.name.localeCompare(right.stat.name))
        : [node]
      if (long) ctx.write(`total ${entries.reduce((total, entry) => total + entry.stat.size, 0)}\n`)
      ctx.write(entries.map(entry => long ? `${entry.stat.type === 'dir' ? 'd' : '-'}${(entry.stat.mode & 0o777).toString(8)} ${entry.stat.uid} ${entry.stat.gid} ${entry.stat.size} ${entry.stat.name}` : entry.stat.name).join(long ? '\n' : '  ') + (entries.length ? '\n' : ''))
      if (recursive && node.stat.type === 'dir' && node.children) {
        for (const entry of entries.filter(child => child.stat.type === 'dir')) {
          const childPath = `${path.replace(/\/$/, '')}/${entry.stat.name}`
          ctx.write(`\n${childPath}:\n`)
          await executeCommand('ls', [...args.filter(argument => argument !== '-R'), childPath], ctx)
        }
      }
      return 0
    }
    case 'mkdir': {
      const paths = pathsFrom(args)
      for (const path of paths) {
        if (!canCreateAt(ctx, path)) {
          ctx.error(`mkdir: cannot create directory '${path}': Permission denied\n`)
          return 1
        }
        const success = args.includes('-p') ? ctx.fs.mkdirRecursive(path, ctx.uid, ctx.gid) : ctx.fs.mkdir(path, ctx.uid, ctx.gid)
        if (!success) {
          ctx.error(`mkdir: cannot create directory '${path}': File exists or parent directory is missing\n`)
          return 1
        }
      }
      return 0
    }
    case 'touch': {
      for (const path of pathsFrom(args)) {
        if (!ctx.fs.exists(path) && (!canCreateAt(ctx, path) || !ctx.fs.writeFile(path, '', ctx.uid, ctx.gid))) {
          ctx.error(`touch: cannot touch '${path}': No such file or directory\n`)
          return 1
        }
      }
      return 0
    }
    case 'rm': {
      const paths = pathsFrom(args)
      if (!paths.length) {
        ctx.error('rm: missing operand\n')
        return 1
      }
      for (const path of paths) {
        const node = ctx.fs.getNode(path)
        if (node && !ctx.fs.hasPermission(parentPath(path), ctx.uid, ctx.gid, 'write')) {
          ctx.error(`rm: cannot remove '${path}': Permission denied\n`)
          return 1
        }
        if (!node || !ctx.fs.remove(path, args.some(argument => argument.includes('r')))) {
          ctx.error(`rm: cannot remove '${path}': ${node ? 'Is a directory' : 'No such file or directory'}\n`)
          return 1
        }
      }
      return 0
    }
    case 'cp':
    case 'mv': {
      const paths = pathsFrom(args)
      if (paths.length < 2) {
        ctx.error(`${command}: missing file operand\n`)
        return 1
      }
      const [source, destination] = paths
      if (command === 'cp' && !ctx.fs.hasPermission(source, ctx.uid, ctx.gid, 'read')) {
        ctx.error(`cp: cannot open '${source}' for reading: Permission denied\n`)
        return 1
      }
      if (!ctx.fs.hasPermission(parentPath(destination), ctx.uid, ctx.gid, 'write')) {
        ctx.error(`${command}: cannot create '${destination}': Permission denied\n`)
        return 1
      }
      const success = command === 'cp'
        ? ctx.fs.copy(source, destination, args.some(argument => argument.includes('r')))
        : ctx.fs.move(source, destination)
      if (!success) {
        ctx.error(`${command}: cannot ${command === 'cp' ? 'stat' : 'move'} '${source}': No such file or directory\n`)
        return 1
      }
      return 0
    }
    case 'ln': {
      const paths = pathsFrom(args)
      if (paths.length < 2 || !args.includes('-s')) {
        ctx.error('ln: missing file operand (symbolic links use ln -s TARGET LINK)\n')
        return 1
      }
      if (!ctx.fs.symlink(paths[0], paths[1], ctx.uid, ctx.gid)) {
        ctx.error(`ln: failed to create symbolic link '${paths[1]}': No such file or directory\n`)
        return 1
      }
      return 0
    }
    case 'find': {
      const path = pathsFrom(args)[0] ?? '.'
      const nameIndex = args.indexOf('-name')
      const pattern = nameIndex >= 0 ? globPattern(args[nameIndex + 1] ?? '*') : null
      const matches = [path, ...collectFiles(ctx, path, true)]
      ctx.write([...new Set(matches)].filter(item => {
        const node = ctx.fs.getNode(item)
        return !pattern || (node !== null && pattern.test(node.stat.name))
      }).join('\n') + '\n')
      return 0
    }
    case 'tree': {
      const path = pathsFrom(args)[0] ?? '.'
      const walk = (current: string, prefix: string): string[] => {
        const entries = ctx.fs.listDirectory(current) ?? []
        return entries.flatMap((entry, index) => {
          const last = index === entries.length - 1
          const line = `${prefix}${last ? '└── ' : '├── '}${entry.stat.name}`
          return entry.stat.type === 'dir' ? [line, ...walk(`${current.replace(/\/$/, '')}/${entry.stat.name}`, `${prefix}${last ? '    ' : '│   '}`)] : [line]
        })
      }
      ctx.write(`${path}\n${walk(path, '').join('\n')}\n`)
      return 0
    }
    case 'stat': {
      const path = pathsFrom(args)[0]
      const node = path ? ctx.fs.getNode(path) : null
      if (!path || !node) {
        ctx.error(`stat: cannot statx '${path ?? ''}': No such file or directory\n`)
        return 1
      }
      if (!ctx.fs.hasPermission(path, ctx.uid, ctx.gid, 'read')) {
        ctx.error(`stat: cannot stat '${path}': Permission denied\n`)
        return 1
      }
      ctx.write(`  File: ${path}\n  Size: ${node.stat.size}\tBlocks: 8\tIO Block: 4096 ${node.stat.type}\nDevice: 0,0\tInode: 1\tLinks: 1\nAccess: (${node.stat.mode.toString(8)})\tUid: (${node.stat.uid})\tGid: (${node.stat.gid})\n`)
      return 0
    }
    case 'file': {
      const path = pathsFrom(args)[0]
      const node = path ? ctx.fs.getNode(path) : null
      if (!path || !node) {
        ctx.error(`file: ${path ?? 'missing operand'}: cannot open: No such file or directory\n`)
        return 1
      }
      ctx.write(`${path}: ${node.stat.type === 'dir' ? 'directory' : node.stat.type === 'symlink' ? `symbolic link to ${node.stat.target}` : 'ASCII text'}\n`)
      return 0
    }
    case 'chmod': {
      const paths = pathsFrom(args)
      const mode = paths.shift()
      const numericMode = mode && /^[0-7]{3,4}$/.test(mode) ? Number.parseInt(mode, 8) : null
      if (numericMode === null || !paths.length) {
        ctx.error('chmod: mode and file operands are required\n')
        return 1
      }
      for (const path of paths) {
        if (!ctx.fs.changeMode(path, numericMode, ctx.uid)) {
          ctx.error(`chmod: changing permissions of '${path}': Operation not permitted\n`)
          return 1
        }
      }
      return 0
    }
    case 'grep': {
      const recursive = args.some(argument => argument.includes('r'))
      const ignoreCase = args.some(argument => argument.includes('i'))
      const showLineNumber = args.some(argument => argument.includes('n'))
      const values = pathsFrom(args)
      const pattern = values.shift()
      if (!pattern) {
        ctx.error('grep: missing search pattern\n')
        return 2
      }
      let matcher: RegExp
      try {
        matcher = new RegExp(pattern, ignoreCase ? 'i' : '')
      } catch {
        ctx.error(`grep: Invalid regular expression: '${pattern}'\n`)
        return 2
      }
      const files = values.flatMap(path => collectFiles(ctx, path, recursive))
      const content = files.length ? files.map(path => ({ path, text: ctx.fs.getNode(path)?.content ?? '' })) : [{ path: '', text: ctx.stdin }]
      let matches = 0
      for (const item of content) {
        item.text.split('\n').forEach((line, index) => {
          if (matcher.test(line)) {
            const prefix = `${content.length > 1 ? `${item.path}:` : ''}${showLineNumber ? `${index + 1}:` : ''}`
            ctx.write(`${prefix}${line}\n`)
            matches += 1
          }
          matcher.lastIndex = 0
        })
      }
      return matches ? 0 : 1
    }
    case 'sort': {
      const path = pathsFrom(args)[0]
      const content = path ? ctx.fs.getNode(path)?.content ?? '' : ctx.stdin
      const sorted = content.split('\n').filter((line, index, lines) => line || index < lines.length - 1).sort((left, right) => left.localeCompare(right))
      ctx.write(sorted.join('\n') + (sorted.length ? '\n' : ''))
      return 0
    }
    case 'uniq': {
      const path = pathsFrom(args)[0]
      const content = path ? ctx.fs.getNode(path)?.content ?? '' : ctx.stdin
      const lines = content.split('\n')
      const unique = lines.filter((line, index) => index === 0 || line !== lines[index - 1])
      ctx.write(unique.join('\n'))
      return 0
    }
    case 'cut': {
      const path = pathsFrom(args)[0]
      const content = path ? ctx.fs.getNode(path)?.content ?? '' : ctx.stdin
      const delimiter = args.includes('-d') ? args[args.indexOf('-d') + 1] ?? '\t' : '\t'
      const field = args.includes('-f') ? Number(args[args.indexOf('-f') + 1] ?? 1) - 1 : 0
      ctx.write(content.split('\n').map(line => line.split(delimiter)[field] ?? '').join('\n') + '\n')
      return 0
    }
    case 'tr': {
      const from = args[0] ?? ''
      const to = args[1] ?? ''
      const replacements = new Map(from.split('').map((character, index) => [character, to[index] ?? to.at(-1) ?? '']))
      ctx.write([...ctx.stdin].map(character => replacements.get(character) ?? character).join(''))
      return 0
    }
    case 'printf': {
      const [format = '', ...values] = args
      let valueIndex = 0
      const result = format.replace(/\\([nrt\\])|%(%|s|d)/g, (_match, escape: string | undefined, specifier: string | undefined) => {
        if (escape) return ({ n: '\n', r: '\r', t: '\t', '\\': '\\' })[escape] ?? escape
        if (specifier === '%') return '%'
        const value = values[valueIndex++] ?? ''
        return specifier === 'd' ? String(Number.parseInt(value, 10) || 0) : value
      })
      ctx.write(result)
      return 0
    }
    case 'diff': {
      const [leftPath, rightPath] = pathsFrom(args)
      const left = leftPath ? ctx.fs.getNode(leftPath)?.content : undefined
      const right = rightPath ? ctx.fs.getNode(rightPath)?.content : undefined
      if (left === undefined || right === undefined) {
        ctx.error('diff: missing or unreadable file operand\n')
        return 2
      }
      if (left === right) return 0
      ctx.write(`--- ${leftPath}\n+++ ${rightPath}\n`)
      ctx.write(`-${left.trimEnd()}\n+${right.trimEnd()}\n`)
      return 1
    }
    case 'du': {
      const path = pathsFrom(args)[0] ?? '.'
      const node = ctx.fs.getNode(path)
      if (!node) {
        ctx.error(`du: cannot access '${path}': No such file or directory\n`)
        return 1
      }
      const size = collectFiles(ctx, path, true).reduce((total, file) => total + (ctx.fs.getNode(file)?.stat.size ?? 0), node.stat.size)
      ctx.write(`${Math.ceil(size / 1024)}\t${path}\n`)
      return 0
    }
    case 'df':
      ctx.write('Filesystem     1K-blocks  Used Available Use% Mounted on\n/dev/vda1        1024000  128000    896000  13% /\n')
      return 0
    case 'head':
    case 'tail': {
      const path = args.find(argument => !argument.startsWith('-'))
      const countArg = args.find(argument => /^-\d+$/.test(argument))
      const count = countArg ? Number(countArg.slice(1)) : 10
      const node = path ? ctx.fs.getNode(path) : null
      if (!path || !node) {
        ctx.error(`${command}: ${path ?? 'missing file operand'}: No such file or directory\n`)
        return 1
      }
      const lines = (node.content ?? '').split('\n')
      ctx.write((command === 'head' ? lines.slice(0, count) : lines.slice(-count)).join('\n') + '\n')
      return 0
    }
    case 'wc': {
      const path = args.find(argument => !argument.startsWith('-'))
      const node = path ? ctx.fs.getNode(path) : null
      if (!node) {
        ctx.error(`wc: ${path ?? 'missing file operand'}: No such file or directory\n`)
        return 1
      }
      const content = node.content ?? ''
      const lines = content ? content.split('\n').length - (content.endsWith('\n') ? 1 : 0) : 0
      ctx.write(`${lines} ${content.trim() ? content.trim().split(/\s+/).length : 0} ${content.length} ${path}\n`)
      return 0
    }
    case 'clear':
      ctx.write('\x1b[2J\x1b[H')
      return 0
    case 'help':
      ctx.write('ArchLab commands: cat cd clear date echo env head help hostname ls mkdir pwd tail touch uname whoami which wc\n')
      return 0
    case 'true':
      return 0
    case 'false':
      return 1
    default:
      ctx.error(`bash: ${cmd}: command not found\n`)
      return 127
  }
}
