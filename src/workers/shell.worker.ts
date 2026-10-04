import { executeCommand } from '@/commands'
import { VirtualFS } from '@/fs/VirtualFS'
import { parseShell } from '@/shell/parser'
import type { CommandContext, ShellCommand } from '@/types'

type WorkerRequest =
  | { type: 'run'; line: string }
  | { type: 'complete'; input: string }
  | { type: 'reset' }
  | { type: 'interrupt' }

const workerScope = self as DedicatedWorkerGlobalScope
let fs = new VirtualFS()
const user = { uid: 1000, gid: 1000, name: 'archuser', home: '/home/archuser', shell: '/bin/bash' }
const rootUser = { uid: 0, gid: 0, name: 'root', home: '/root', shell: '/bin/bash' }
let currentUser = user
const environment: Record<string, string> = {
  HOME: user.home,
  HOSTNAME: 'archlinux',
  LANG: 'en_US.UTF-8',
  PATH: '/usr/local/sbin:/usr/local/bin:/usr/bin:/bin',
  PWD: user.home,
  SHELL: '/bin/bash',
  TERM: 'xterm-256color',
  USER: user.name
}
let lastStatus = 0
const commandHistory: string[] = []
const installedPackages = new Set(['base', 'bash', 'filesystem', 'glibc', 'linux', 'linux-firmware', 'pacman', 'systemd', 'systemd-sysvcompat', 'sudo', 'util-linux', 'vim'])
const activeServices = new Set(['systemd-journald', 'systemd-logind', 'systemd-udevd'])
const enabledServices = new Set<string>()
const mountedDevices = new Map<string, string>()
const aliases = new Map<string, string>()
let packageCatalogPromise: Promise<typeof import('@/pkgdb/catalog')> | null = null

function openFilesystemDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('archlab-filesystem', 1)
    request.onupgradeneeded = () => request.result.createObjectStore('state')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function restoreFilesystem(): Promise<void> {
  try {
    const database = await openFilesystemDatabase()
    const snapshot = await new Promise<unknown>((resolve, reject) => {
      const request = database.transaction('state', 'readonly').objectStore('state').get('root')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    if (typeof snapshot === 'string') fs.restore(snapshot)
    database.close()
  } catch {
    // IndexedDB can be unavailable in private browsing; the in-memory FS remains usable.
  }
}

async function persistFilesystem(): Promise<void> {
  try {
    const database = await openFilesystemDatabase()
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction('state', 'readwrite')
      transaction.objectStore('state').put(fs.serialize(), 'root')
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
    database.close()
  } catch {
    // Keep command execution available if browser storage is blocked or full.
  }
}

const filesystemReady = restoreFilesystem()

function loadPackageCatalog(): Promise<typeof import('@/pkgdb/catalog')> {
  packageCatalogPromise ??= import('@/pkgdb/catalog')
  return packageCatalogPromise
}

const builtins = ['arch-chroot', 'cat', 'cd', 'clear', 'curl', 'date', 'df', 'echo', 'env', 'exit', 'export', 'fdisk', 'find', 'free', 'genfstab', 'grep', 'grub-mkconfig', 'head', 'help', 'history', 'hostname', 'ip', 'journalctl', 'ls', 'lsblk', 'man', 'mkdir', 'mkfs.ext4', 'mkinitcpio', 'mount', 'nslookup', 'pacman', 'pacstrap', 'paru', 'ping', 'ps', 'pwd', 'rm', 'ss', 'stat', 'su', 'sudo', 'systemctl', 'tail', 'timedatectl', 'touch', 'top', 'true', 'uname', 'uptime', 'wget', 'whoami', 'which', 'wc', 'yay']

async function packageManager(command: string, args: string[], context: CommandContext): Promise<number> {
  const { packageCatalog } = await loadPackageCatalog()
  const query = args.find(argument => argument.startsWith('-')) ?? ''
  const names = args.filter(argument => !argument.startsWith('-'))
  const aur = command !== 'pacman'
  if (args.includes('--help')) {
    context.write(`${command} [options] [package]\n  -S install  -Syu upgrade  -Ss search  -Si info  -Q query  -R remove\n`)
    return 0
  }
  if (query.includes('S') && query.includes('s')) {
    const term = names.join(' ').toLowerCase()
    const results = packageCatalog.filter(pkg => `${pkg.name} ${pkg.description}`.toLowerCase().includes(term)).slice(0, 35)
    for (const pkg of results) context.write(`${pkg.repository}/${pkg.name} ${pkg.version}${installedPackages.has(pkg.name) ? ' [installed]' : ''}\n    ${pkg.description}\n`)
    return 0
  }
  if (query.includes('S') && query.includes('i') || query === '-Si') {
    const pkg = packageCatalog.find(item => item.name === names[0])
    if (!pkg) {
      context.error(`error: package '${names[0] ?? ''}' was not found\n`)
      return 1
    }
    context.write(`Repository      : ${pkg.repository}\nName            : ${pkg.name}\nVersion         : ${pkg.version}\nDescription     : ${pkg.description}\nArchitecture    : x86_64\nDepends On      : ${pkg.dependencies.join(' ')}\nDownload Size   : 1.42 MiB\nInstalled Size  : 6.38 MiB\n`)
    return 0
  }
  if (query.startsWith('-Q')) {
    if (query.includes('i')) {
      const pkg = packageCatalog.find(item => item.name === names[0])
      if (!pkg || !installedPackages.has(pkg.name)) {
        context.error(`error: package '${names[0] ?? ''}' was not found\n`)
        return 1
      }
      context.write(`Name            : ${pkg.name}\nVersion         : ${pkg.version}\nDescription     : ${pkg.description}\nArchitecture    : x86_64\nInstall Date    : 2026-10-04\nInstall Reason  : Explicitly installed\n`)
      return 0
    }
    const entries = [...installedPackages].filter(name => !query.includes('e') || !['base', 'bash', 'filesystem', 'glibc', 'linux-firmware', 'systemd-libs', 'util-linux'].includes(name)).sort()
    context.write(entries.map(name => `${name} 1.0.0-1`).join('\n') + '\n')
    return 0
  }
  if (query === '-Syu' || (query.includes('S') && query.includes('y') && query.includes('u'))) {
    context.write(':: Synchronizing package databases...\n core                 100%\n extra                100%\n multilib             100%\n:: Starting full system upgrade...\n there is nothing to do\n')
    return 0
  }
  if (query.includes('S') && !query.includes('s') && !query.includes('i')) {
    if (!names.length) {
      context.error('error: no targets specified (use -h for help)\n')
      return 1
    }
    const targets = names.map(name => packageCatalog.find(pkg => pkg.name === name))
    const missing = names.find((_name, index) => !targets[index])
    if (missing) {
      context.error(`error: target not found: ${missing}\n`)
      return 1
    }
    const pending = targets.filter((pkg): pkg is NonNullable<typeof pkg> => pkg !== undefined && !installedPackages.has(pkg.name))
    if (!pending.length) {
      context.write(`warning: ${names.join(' ')}-${'1.0.0-1'} is up to date -- skipping\n`)
      return 0
    }
    context.write(`resolving dependencies...\nlooking for conflicting packages...\n\nPackages (${pending.length}) ${pending.map(pkg => `${pkg.name}-${pkg.version}`).join(' ')}\n\nTotal Download Size:    8.42 MiB\nTotal Installed Size:  31.60 MiB\n\n:: Proceed with installation? [Y/n] y\n`)
    for (const pkg of pending) {
      context.write(`:: Retrieving packages...\n ${pkg.name}-${pkg.version} 100%\nchecking keys in keyring\nchecking package integrity\nloading package files\ninstalling ${pkg.name}\n`)
      installedPackages.add(pkg.name)
    }
    context.write(':: Running post-transaction hooks...\n(1/1) Arming ConditionNeedsUpdate...\n')
    return 0
  }
  if (query.startsWith('-R')) {
    if (!names.length) {
      context.error('error: no targets specified (use -h for help)\n')
      return 1
    }
    const missing = names.find(name => !installedPackages.has(name))
    if (missing) {
      context.error(`error: target not found: ${missing}\n`)
      return 1
    }
    context.write(`checking dependencies...\nPackages (${names.length}) ${names.join(' ')}\n\n:: Do you want to remove these packages? [Y/n] y\n`)
    for (const name of names) installedPackages.delete(name)
    context.write(':: Running post-transaction hooks...\n')
    return 0
  }
  if (query === '-Sc') {
    context.write('Packages to keep:\n  All locally installed packages\nCache directory: /var/cache/pacman/pkg/\nDo you want to remove all other packages from cache? [Y/n] y\nremoving old packages from cache...\n')
    return 0
  }
  if (query === '-U') {
    context.write(`loading packages...\nresolving dependencies...\ninstalling ${names[0] ?? 'package'}\n`)
    return 0
  }
  if (aur && args.includes('-Syu')) {
    context.write(':: Synchronizing package databases...\n:: Starting full system upgrade...\n:: Checking AUR updates...\n there is nothing to do\n')
    return 0
  }
  context.error(`error: invalid option '${query}'\n`)
  return 2
}

function systemCommand(name: string, args: string[], context: CommandContext): number {
  if (args.includes('--help')) {
    context.write(`${name} simulated Arch Linux command\n`)
    return 0
  }
  if (name === 'systemctl') {
    const action = args[0] ?? 'list-units'
    const unit = args[1] ?? 'sshd'
    if (action === 'list-units') {
      const units = ['systemd-journald', 'systemd-logind', 'systemd-udevd', 'sshd', ' NetworkManager']
      context.write('UNIT                       LOAD   ACTIVE SUB     DESCRIPTION\n')
      for (const entry of units) context.write(`${entry.padEnd(27)} loaded ${activeServices.has(entry) ? 'active' : 'inactive'} running ${entry} service\n`)
      return 0
    }
    if (action === 'status') {
      context.write(`○ ${unit}.service - ${unit} service\n     Loaded: loaded (/usr/lib/systemd/system/${unit}.service; ${enabledServices.has(unit) ? 'enabled' : 'disabled'})\n     Active: ${activeServices.has(unit) ? 'active (running)' : 'inactive (dead)'}\n`)
      return 0
    }
    if (action === 'start' || action === 'stop' || action === 'restart') {
      if (action === 'stop') activeServices.delete(unit)
      else activeServices.add(unit)
      context.write(`Simulated ${action} job for ${unit}.service completed.\n`)
      return 0
    }
    if (action === 'enable' || action === 'disable') {
      if (action === 'enable') enabledServices.add(unit)
      else enabledServices.delete(unit)
      context.write(`${action === 'enable' ? 'Created' : 'Removed'} symlink for ${unit}.service.\n`)
      return 0
    }
    context.error(`systemctl: unrecognized command '${action}'\n`)
    return 1
  }
  if (name === 'journalctl') {
    const countIndex = args.indexOf('-n')
    const count = countIndex >= 0 ? Number(args[countIndex + 1]) || 10 : 10
    const lines = [
      'Oct 04 08:41:02 archlinux systemd[1]: Started Journal Service.',
      'Oct 04 08:41:02 archlinux kernel: Linux version 6.12.8-arch1-1',
      'Oct 04 08:41:03 archlinux systemd[1]: Reached target Multi-User System.'
    ]
    context.write(lines.slice(-count).join('\n') + '\n')
    return 0
  }
  if (name === 'lsblk') {
    context.write('NAME   MAJ:MIN RM  SIZE RO TYPE MOUNTPOINTS\nvda    254:0    0   32G  0 disk\n└─vda1 254:1    0   32G  0 part /mnt\n')
    return 0
  }
  if (name === 'fdisk') {
    context.write('Disk /dev/vda: 32 GiB, 34359738368 bytes, 67108864 sectors\nDisklabel type: gpt\nDevice       Start      End  Sectors  Size Type\n/dev/vda1     2048 67108830 67106783   32G Linux filesystem\n')
    return 0
  }
  if (name === 'mkfs.ext4') {
    context.write(`mke2fs 1.47.2 (1-Jan-2025)\nCreating filesystem with 8388352 4k blocks and 2097152 inodes\nFilesystem UUID: 6b07c764-arch-4f7a-ae71-000000000001\nSuperblock backups stored on blocks: 32768, 98304, 163840\n`)
    return 0
  }
  if (name === 'mount') {
    const [device, mountpoint] = args
    if (!device || !mountpoint || !context.fs.exists(mountpoint)) {
      context.error(`mount: ${mountpoint ?? ''}: mount point does not exist\n`)
      return 32
    }
    mountedDevices.set(mountpoint, device)
    context.write('')
    return 0
  }
  if (name === 'umount') {
    if (!mountedDevices.delete(args[0] ?? '')) {
      context.error(`umount: ${args[0] ?? ''}: not mounted\n`)
      return 32
    }
    return 0
  }
  if (name === 'genfstab') {
    context.write('# /dev/vda1\nUUID=6b07c764-arch-4f7a-ae71-000000000001 / ext4 rw,relatime 0 1\n')
    return 0
  }
  if (name === 'pacstrap') {
    context.write(`==> Creating install root at ${args[0] ?? '/mnt'}\n==> Installing packages to ${args[0] ?? '/mnt'}\n(${args.slice(1).join(' ') || 'base linux linux-firmware'}) 100%\n==> Installation complete\n`)
    return 0
  }
  if (name === 'arch-chroot') {
    context.write(`==> Entered simulated chroot at ${args[0] ?? '/mnt'} (type exit to leave)\n`)
    return 0
  }
  if (name === 'grub-mkconfig') {
    context.write('Generating grub configuration file ...\nFound linux image: /boot/vmlinuz-linux\nFound initrd image: /boot/initramfs-linux.img\ndone\n')
    return 0
  }
  if (name === 'mkinitcpio') {
    context.write('==> Building image from preset: /etc/mkinitcpio.d/linux.preset\n==> Image generation successful\n')
    return 0
  }
  if (name === 'locale-gen') {
    context.write('Generating locales...\n  en_US.UTF-8... done\nGeneration complete.\n')
    return 0
  }
  if (name === 'timedatectl') {
    context.write('               Local time: Sun 2026-10-04 12:00:00 UTC\n           Universal time: Sun 2026-10-04 12:00:00 UTC\n                 Time zone: UTC (UTC, +0000)\nSystem clock synchronized: yes\n')
    return 0
  }
  if (name === 'hostnamectl') {
    context.write(' Static hostname: archlinux\n       Icon name: computer\n Operating System: Arch Linux\n           Kernel: Linux 6.12.8-arch1-1\n')
    return 0
  }
  if (name === 'localectl') {
    context.write('System Locale: LANG=en_US.UTF-8\n    VC Keymap: us\n   X11 Layout: us\n')
    return 0
  }
  return 127
}

function networkCommand(name: string, args: string[], context: CommandContext): number {
  if (args.includes('--help')) {
    context.write(`${name} [options] [host|address]\nNetwork simulation does not contact the internet.\n`)
    return 0
  }
  if (name === 'ip' && (args[0] === 'a' || args[0] === 'addr')) {
    context.write('1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536\n    inet 127.0.0.1/8 scope host lo\n2: enp0s3: <BROADCAST,MULTICAST,UP> mtu 1500\n    inet 192.168.1.42/24 brd 192.168.1.255 scope global dynamic enp0s3\n')
    return 0
  }
  if (name === 'ip' && args[0] === 'route') {
    context.write('default via 192.168.1.1 dev enp0s3 proto dhcp metric 100\n192.168.1.0/24 dev enp0s3 proto kernel scope link src 192.168.1.42\n')
    return 0
  }
  if (name === 'ping') {
    const host = args.at(-1) ?? 'localhost'
    const countIndex = args.indexOf('-c')
    const count = countIndex >= 0 ? Math.min(Number(args[countIndex + 1]) || 4, 10) : 4
    context.write(`PING ${host} (93.184.216.34) 56(84) bytes of data.\n`)
    for (let index = 1; index <= count; index += 1) context.write(`64 bytes from 93.184.216.34: icmp_seq=${index} ttl=57 time=18.${index} ms\n`)
    context.write(`--- ${host} ping statistics ---\n${count} packets transmitted, ${count} received, 0% packet loss\n`)
    return 0
  }
  if (name === 'curl' || name === 'wget') {
    const url = args.find(argument => argument.startsWith('http'))
    if (!url) {
      context.error(`${name}: missing URL\n`)
      return 2
    }
    if (name === 'curl') context.write(`<!doctype html><title>Arch Linux</title><h1>Arch Linux</h1>\n`)
    else context.write(`--2026-10-04 12:00:00--  ${url}\nResolving ${new URL(url).hostname}... 93.184.216.34\nSaving to: 'index.html'\nindex.html saved [2456/2456]\n`)
    return 0
  }
  if (name === 'ss') {
    context.write('Netid State  Recv-Q Send-Q Local Address:Port  Peer Address:Port\nudp   UNCONN 0      0      127.0.0.1:323       0.0.0.0:*\ntcp   LISTEN 0      128    0.0.0.0:22          0.0.0.0:*\n')
    return 0
  }
  if (name === 'nslookup') {
    const host = args[0] ?? 'archlinux.org'
    context.write(`Server:  192.168.1.1\nAddress: 192.168.1.1#53\n\nNon-authoritative answer:\nName: ${host}\nAddress: 93.184.216.34\n`)
    return 0
  }
  return 127
}

function expand(value: string): string {
  return value.replace(/^~(?=\/|$)/, environment.HOME).replace(/\$([A-Za-z_][A-Za-z0-9_]*|\?)/g, (_match, name: string) => {
    return name === '?' ? String(lastStatus) : environment[name] ?? ''
  })
}

function globExpression(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')
  return new RegExp(`^${escaped}$`)
}

async function expandArguments(rawArguments: string[]): Promise<string[]> {
  const expanded: string[] = []
  for (const rawArgument of rawArguments) {
    let argument = expand(rawArgument)
    const substitutions = [...argument.matchAll(/\$\(([^()]*)\)/g)]
    for (const substitution of substitutions) {
      const nested = await executeList(substitution[1])
      argument = argument.replace(substitution[0], nested.output.trim())
    }
    if (!/[*?[]/.test(argument)) {
      expanded.push(argument)
      continue
    }
    const slash = argument.lastIndexOf('/')
    const directory = slash >= 0 ? argument.slice(0, slash + 1) || '/' : '.'
    const pattern = slash >= 0 ? argument.slice(slash + 1) : argument
    const matches = (fs.listDirectory(directory) ?? [])
      .filter(node => globExpression(pattern).test(node.stat.name))
      .map(node => `${directory === '.' ? '' : directory}${node.stat.name}`)
    expanded.push(...(matches.length ? matches : [argument]))
  }
  return expanded
}

async function execute(command: ShellCommand, stdin: string, executionUser = currentUser): Promise<{ output: string; error: string; status: number }> {
  const args = await expandArguments(command.args)
  const name = args.shift() ?? ''
  let output = ''
  let error = ''
  const context: CommandContext = {
    fs,
    env: environment,
    cwd: fs.getCurrentDirectory(),
    uid: executionUser.uid,
    gid: executionUser.gid,
    pid: 1,
    history: commandHistory,
    setHistory: next => { commandHistory.splice(0, commandHistory.length, ...next) },
    exitCode: lastStatus,
    setExitCode: code => { lastStatus = code },
    write: data => { output += data },
    error: data => { error += data },
    user: executionUser,
    stdin: command.redirectIn ? fs.getNode(command.redirectIn)?.content ?? '' : stdin
  }
  if (name === 'sudo') {
    const elevated = args.filter(argument => argument !== '-E' && argument !== '-H')
    if (!elevated.length) {
      context.error('usage: sudo command [argument ...]\n')
      return { output, error, status: 1 }
    }
    return execute({ ...command, args: elevated }, stdin, rootUser)
  }
  if (name === 'su') {
    currentUser = rootUser
    environment.USER = rootUser.name
    environment.HOME = rootUser.home
    context.write('Switched to simulated root shell. Type exit to return.\n')
    return { output, error, status: 0 }
  }
  if (name === 'exit') {
    currentUser = user
    environment.USER = user.name
    environment.HOME = user.home
    return { output, error, status: 0 }
  }
  if (name === 'alias') {
    if (!args.length) {
      for (const [key, value] of aliases) context.write(`alias ${key}='${value}'\n`)
    } else {
      for (const entry of args) {
        const separator = entry.indexOf('=')
        if (separator > 0) aliases.set(entry.slice(0, separator), entry.slice(separator + 1))
      }
    }
    return { output, error, status: 0 }
  }
  if (name === 'unalias') {
    for (const key of args) aliases.delete(key)
    return { output, error, status: 0 }
  }
  const alias = aliases.get(name)
  if (alias) {
    const aliasArguments = parseShell(alias)[0]?.commands[0]?.args ?? []
    return execute({ ...command, args: [...aliasArguments, ...args] }, stdin)
  }
  if (name === 'pacman' || name === 'yay' || name === 'paru') {
    const status = await packageManager(name, args, context)
    return { output, error, status }
  }
  if (['systemctl', 'journalctl', 'lsblk', 'fdisk', 'mkfs.ext4', 'mount', 'umount', 'genfstab', 'pacstrap', 'arch-chroot', 'grub-mkconfig', 'mkinitcpio', 'locale-gen', 'timedatectl', 'hostnamectl', 'localectl'].includes(name)) {
    const status = systemCommand(name, args, context)
    if (status !== 127) return { output, error, status }
  }
  if (['ip', 'ping', 'curl', 'wget', 'ss', 'nslookup'].includes(name)) {
    const status = networkCommand(name, args, context)
    if (status !== 127) return { output, error, status }
  }
  if (name === 'ps') {
    context.write('PID TTY          TIME CMD\n  1 ?        00:00:01 systemd\n  2 ?        00:00:00 kthreadd\n 42 pts/0    00:00:00 bash\n 58 pts/0    00:00:00 ps\n')
    return { output, error, status: 0 }
  }
  if (name === 'top' || name === 'htop') {
    context.write(`top - 12:00:00 up 2 days,  4:18,  1 user,  load average: 0.08, 0.12, 0.10\nTasks:  42 total,   1 running,  41 sleeping,   0 stopped\n%Cpu(s):  2.0 us,  1.0 sy, 97.0 id\nMiB Mem :   7936.0 total,   1842.0 free,   2911.0 used\n\n  PID USER      PR  NI    VIRT    RES S  %CPU %MEM COMMAND\n   42 archuser  20   0  124.0m  14.2m S   0.3  0.2 bash\n`)
    return { output, error, status: 0 }
  }
  if (name === 'uptime') {
    context.write(' 12:00:00 up 2 days,  4:18,  1 user,  load average: 0.08, 0.12, 0.10\n')
    return { output, error, status: 0 }
  }
  if (name === 'free') {
    context.write(args.includes('-h') ? '               total        used        free      shared  buff/cache   available\nMem:           7.7Gi       2.8Gi       1.8Gi       144Mi       3.1Gi       4.5Gi\nSwap:          2.0Gi          0B       2.0Gi\n' : '               total        used        free\nMem:         8095744     2936012     1887436\nSwap:        2097148           0     2097148\n')
    return { output, error, status: 0 }
  }
  if (name === 'history') {
    context.write(commandHistory.map((line, index) => `${String(index + 1).padStart(5)}  ${line}`).join('\n') + '\n')
    return { output, error, status: 0 }
  }
  if (name === 'man') {
    const page = args.find(argument => !argument.startsWith('-'))
    const pages: Record<string, string> = {
      ls: 'NAME\n    ls - list directory contents\nSYNOPSIS\n    ls [OPTION]... [FILE]...\nOPTIONS\n    -a, --all       do not ignore entries starting with .\n    -l              use a long listing format\n    -R              list subdirectories recursively\n',
      pacman: 'NAME\n    pacman - package manager utility\nSYNOPSIS\n    pacman {-S --sync} [options] [packages]\n    pacman {-Q --query} [options] [packages]\n    pacman {-R --remove} [options] <package>...\n',
      grep: 'NAME\n    grep - print lines that match patterns\nSYNOPSIS\n    grep [OPTION]... PATTERNS [FILE]...\nOPTIONS\n    -i              ignore case distinctions\n    -n              print line number with output lines\n    -r              read files under each directory recursively\n'
    }
    if (page && pages[page]) context.write(pages[page])
    else context.error(`No manual entry for ${page ?? ''}\n`)
    return { output, error, status: page && pages[page] ? 0 : 16 }
  }
  if (name === 'bash' || name === 'sh') {
    const scriptPath = args.find(argument => !argument.startsWith('-'))
    const script = scriptPath ? fs.getNode(scriptPath) : null
    if (scriptPath && script?.stat.type === 'file') {
      let scriptOutput = ''
      let scriptError = ''
      let status = 0
      for (const line of (script.content ?? '').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const result = await executeLine(trimmed)
        scriptOutput += result.output
        scriptError += result.error
        status = result.status
      }
      return { output: scriptOutput, error: scriptError, status }
    }
  }
  if (name === '[' || name === 'test') {
    const condition = args.filter(argument => argument !== ']')
    const target = condition[1]
    const node = target ? fs.getNode(target) : null
    const matched = condition[0] === '-d' ? node?.stat.type === 'dir' : condition[0] === '-f' ? node?.stat.type === 'file' : condition[0] === '-e' ? node !== null : false
    return { output, error, status: matched ? 0 : 1 }
  }
  if (name === 'export') {
    for (const assignment of args) {
      const separator = assignment.indexOf('=')
      if (separator > 0) environment[assignment.slice(0, separator)] = assignment.slice(separator + 1)
    }
    return { output, error, status: 0 }
  }
  let status = await executeCommand(name, args, context)
  if (command.redirectOut) {
    const content = (command.redirectOutAppend ? fs.getNode(command.redirectOut)?.content ?? '' : '') + output
    if (!canWrite(command.redirectOut, executionUser.uid, executionUser.gid) || !fs.writeFile(command.redirectOut, content, executionUser.uid, executionUser.gid)) {
      error += `bash: ${command.redirectOut}: ${fs.exists(command.redirectOut) ? 'Permission denied' : 'No such file or directory'}\n`
      status = 1
    } else output = ''
  }
  if (command.redirectErr) {
    if (!canWrite(command.redirectErr, executionUser.uid, executionUser.gid) || !fs.writeFile(command.redirectErr, error, executionUser.uid, executionUser.gid)) {
      error += `bash: ${command.redirectErr}: ${fs.exists(command.redirectErr) ? 'Permission denied' : 'No such file or directory'}\n`
      status = 1
    } else error = ''
  }
  return { output, error, status }
}

function canWrite(path: string, uid: number, gid: number): boolean {
  if (fs.exists(path)) return fs.hasPermission(path, uid, gid, 'write')
  let parent = path.slice(0, path.lastIndexOf('/')) || '.'
  while (!fs.exists(parent) && parent !== '/') parent = parent.slice(0, parent.lastIndexOf('/')) || '.'
  return fs.hasPermission(parent, uid, gid, 'write') && fs.hasPermission(parent, uid, gid, 'execute')
}

async function executeList(line: string): Promise<{ output: string; error: string; status: number }> {
  let output = ''
  let error = ''
  let status = lastStatus
  for (const pipeline of parseShell(line)) {
    if (pipeline.condition === '&&' && status !== 0) continue
    if (pipeline.condition === '||' && status === 0) continue
    let pipeOutput = ''
    for (const command of pipeline.commands) {
      const result = await execute(command, pipeOutput)
      pipeOutput = result.output
      error += result.error
      status = result.status
    }
    output += pipeOutput
    lastStatus = status
  }
  return { output, error, status }
}

async function executeLine(line: string): Promise<{ output: string; error: string; status: number }> {
  const trimmed = line.trim()
  const forLoop = /^for\s+([A-Za-z_][A-Za-z0-9_]*)\s+in\s+(.+?);\s*do\s+(.+?);\s*done$/.exec(trimmed)
  if (forLoop) {
    let output = ''
    let error = ''
    let status = 0
    for (const value of forLoop[2].split(/\s+/).map(expand)) {
      environment[forLoop[1]] = value.replace(/^['"]|['"]$/g, '')
      const result = await executeList(forLoop[3])
      output += result.output
      error += result.error
      status = result.status
    }
    return { output, error, status }
  }
  const ifBlock = /^if\s+\[\s+(-[fde])\s+(.+?)\s+\];\s*then\s+(.+?)(?:;\s*else\s+(.+?))?;\s*fi$/.exec(trimmed)
  if (ifBlock) {
    const path = ifBlock[2].replace(/^['"]|['"]$/g, '')
    const node = fs.getNode(path)
    const condition = ifBlock[1] === '-d' ? node?.stat.type === 'dir' : ifBlock[1] === '-f' ? node?.stat.type === 'file' : node !== null
    const branch = condition ? ifBlock[3] : ifBlock[4]
    return branch ? executeList(branch) : { output: '', error: '', status: 0 }
  }
  const whileLoop = /^while\s+\[\s*(\d+)\s+-lt\s+(\d+)\s*\];\s*do\s+(.+?);\s*done$/.exec(trimmed)
  if (whileLoop) {
    let output = ''
    let error = ''
    let status = 0
    for (let iteration = Number(whileLoop[1]); iteration < Number(whileLoop[2]) && iteration < 100; iteration += 1) {
      environment.LOOP_INDEX = String(iteration)
      const result = await executeList(whileLoop[3])
      output += result.output
      error += result.error
      status = result.status
    }
    delete environment.LOOP_INDEX
    return { output, error, status }
  }
  return executeList(trimmed)
}

async function run(line: string): Promise<void> {
  await filesystemReady
  if (line.trim()) commandHistory.push(line)
  const { output, error, status } = await executeLine(line)
  environment.PWD = fs.getCurrentDirectory()
  await persistFilesystem()
  workerScope.postMessage({ type: 'result', output, error, status, cwd: fs.getCurrentDirectory(), username: currentUser.name })
}

async function complete(input: string): Promise<void> {
  await filesystemReady
  const current = input.split(/\s/).at(-1) ?? ''
  const isCommand = !input.trim().includes(' ')
  const candidates = isCommand
    ? builtins
    : (() => {
        const slash = current.lastIndexOf('/')
        const directory = slash >= 0 ? current.slice(0, slash + 1) || '/' : '.'
        const prefix = slash >= 0 ? current.slice(slash + 1) : current
        const node = fs.getNode(directory)
        return node?.children ? [...node.children.keys()].filter(name => name.startsWith(prefix)).map(name => `${directory === '.' ? '' : directory}${name}`) : []
      })()
  workerScope.postMessage({ type: 'completion', matches: candidates.filter(candidate => candidate.startsWith(current)) })
}

async function resetSystem(): Promise<void> {
  await filesystemReady
  fs = new VirtualFS()
  commandHistory.length = 0
  aliases.clear()
  installedPackages.clear()
  for (const name of ['base', 'bash', 'filesystem', 'glibc', 'linux', 'linux-firmware', 'pacman', 'systemd', 'systemd-sysvcompat', 'sudo', 'util-linux', 'vim']) installedPackages.add(name)
  activeServices.clear()
  for (const name of ['systemd-journald', 'systemd-logind', 'systemd-udevd']) activeServices.add(name)
  enabledServices.clear()
  mountedDevices.clear()
  currentUser = user
  lastStatus = 0
  environment.USER = user.name
  environment.HOME = user.home
  environment.PWD = user.home
  await persistFilesystem()
  workerScope.postMessage({ type: 'reset', cwd: fs.getCurrentDirectory(), username: user.name })
}

workerScope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === 'run') void run(event.data.line)
  if (event.data.type === 'complete') complete(event.data.input)
  if (event.data.type === 'reset') void resetSystem()
  if (event.data.type === 'interrupt') workerScope.postMessage({ type: 'interrupted' })
}