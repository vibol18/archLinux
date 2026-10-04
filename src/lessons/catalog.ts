export interface Lesson {
  id: string
  title: string
  command: string
  explanation: string
  goal: string
  hints: [string, string, string]
  solution: string
}

export interface LessonLevel {
  id: string
  title: string
  lessons: Lesson[]
}

type LessonSeed = [string, string, string, string]

const levelSeeds: Array<{ id: string; title: string; lessons: LessonSeed[] }> = [
  {
    id: 'basics', title: 'Basics', lessons: [
      ['Read your location', 'pwd', 'Print the absolute path of the current working directory.', 'The command has no arguments.'],
      ['List home files', 'ls', 'List the visible files in your home directory.', 'Ask ls to inspect the current directory.'],
      ['See hidden files', 'ls -a', 'Include dotfiles in the directory listing.', 'The all-files option is a short flag.'],
      ['Move to /etc', 'cd /etc', 'Change the shell working directory to /etc.', 'Use cd followed by an absolute path.'],
      ['Print a greeting', 'echo hello, arch', 'Write a line of text to the terminal.', 'echo prints its arguments separated by spaces.'],
      ['Identify the user', 'whoami', 'Print the active account name.', 'This command takes no arguments.'],
      ['Inspect the kernel', 'uname -a', 'Show the simulated kernel and architecture details.', 'The all-information flag is -a.'],
      ['Read the hostname', 'hostname', 'Print the system hostname.', 'Use the hostname command without options.']
    ]
  },
  {
    id: 'files', title: 'Files & Permissions', lessons: [
      ['Create a workspace', 'mkdir -p ~/projects/notes', 'Create a nested directory path in one command.', 'Use mkdir with its parent-creation flag.'],
      ['Create a file', 'touch ~/projects/notes/todo.txt', 'Create an empty todo.txt file.', 'touch creates a missing file.'],
      ['Write a first line', 'echo First steps > ~/projects/notes/todo.txt', 'Write text into the todo file using output redirection.', 'The single greater-than sign replaces file contents.'],
      ['Read the file', 'cat ~/projects/notes/todo.txt', 'Print the new file contents.', 'Pass the file path to cat.'],
      ['Copy the note', 'cp ~/projects/notes/todo.txt ~/projects/notes/backup.txt', 'Create a copy named backup.txt.', 'cp takes a source followed by a destination.'],
      ['Rename the backup', 'mv ~/projects/notes/backup.txt ~/projects/notes/archive.txt', 'Rename the copied file to archive.txt.', 'mv can rename within the same directory.'],
      ['Set private permissions', 'chmod 600 ~/projects/notes/todo.txt', 'Restrict the file to owner read/write access.', 'Use the octal mode 600.'],
      ['Inspect file metadata', 'stat ~/projects/notes/todo.txt', 'Display file type, ownership, size, and mode.', 'stat takes the target path.']
    ]
  },
  {
    id: 'text', title: 'Text Processing', lessons: [
      ['Count file lines', 'wc -l /etc/passwd', 'Count account records in /etc/passwd.', 'wc accepts the line-count flag.'],
      ['Search for root', 'grep -n root /etc/passwd', 'Find root account records and include line numbers.', 'grep accepts a pattern followed by a file.'],
      ['Read the first records', 'head -n 3 /etc/passwd', 'Show only the first three account entries.', 'Use head with -n and a count.'],
      ['Read the final record', 'tail -n 1 /etc/passwd', 'Show the last account entry.', 'Use tail with a count of one.'],
      ['Sort account records', 'sort /etc/passwd', 'Print account records in sorted order.', 'sort reads a file and writes sorted lines.'],
      ['Count unique lines', 'uniq /etc/passwd', 'Collapse adjacent duplicate lines in the account file.', 'uniq filters adjacent repeated lines.'],
      ['Extract account names', 'cut -d : -f 1 /etc/passwd', 'Print the first colon-delimited field.', 'Set the delimiter to colon and select field one.'],
      ['Translate case', 'cat /etc/hostname | tr a-z A-Z', 'Pipe hostname contents through a character translation.', 'Use a pipe to connect cat to tr.']
    ]
  },
  {
    id: 'processes', title: 'Processes', lessons: [
      ['List processes', 'ps', 'Display a snapshot of simulated processes.', 'ps needs no arguments for the default listing.'],
      ['Inspect live activity', 'top', 'Open the simulated process monitor output.', 'Run top by itself.'],
      ['Check uptime', 'uptime', 'Read the system uptime and load average.', 'Use uptime with no arguments.'],
      ['Check memory', 'free -h', 'Display memory totals in readable units.', 'free supports the human-readable flag.'],
      ['Find the shell binary', 'which bash', 'Resolve bash through the current PATH.', 'which looks up an executable by name.'],
      ['Review environment', 'env', 'Print exported shell environment variables.', 'env lists the current environment.'],
      ['Check current status', 'echo $?', 'Print the exit status of the previous command.', 'The special variable is a dollar sign and question mark.'],
      ['Check the clock', 'date', 'Print the simulated system date and time.', 'date takes no arguments.']
    ]
  },
  {
    id: 'pacman', title: 'Pacman & AUR', lessons: [
      ['List installed packages', 'pacman -Q', 'Query the installed package database.', 'Pacman query mode uses -Q.'],
      ['List explicit packages', 'pacman -Qe', 'Show packages explicitly installed by the user.', 'Combine query mode with the explicit flag.'],
      ['Search repositories', 'pacman -Ss vim', 'Search synced repositories for vim.', 'Use sync-search mode and a search term.'],
      ['Inspect a package', 'pacman -Si bash', 'Show repository metadata for bash.', 'Package information uses -Si.'],
      ['Refresh and upgrade', 'pacman -Syu', 'Synchronize package databases and upgrade installed packages.', 'Use sync, refresh, and upgrade flags together.'],
      ['Install a utility', 'pacman -S htop', 'Simulate installing htop and its dependencies.', 'Use sync-install mode with a package name.'],
      ['Remove a package', 'pacman -R htop', 'Simulate removing htop from the virtual system.', 'Use remove mode with a package name.'],
      ['Search the AUR', 'yay -Ss paru', 'Search simulated AUR package results.', 'yay supports the same search flag.']
    ]
  },
  {
    id: 'networking', title: 'Networking', lessons: [
      ['Inspect interfaces', 'ip a', 'Show simulated network interfaces and addresses.', 'Use ip with the address shorthand.'],
      ['Ping a host', 'ping -c 3 archlinux.org', 'Send three simulated ICMP requests.', 'Limit ping with count option -c.'],
      ['Fetch a URL', 'curl https://archlinux.org', 'Display a safe, simulated response for the URL.', 'curl accepts a URL argument.'],
      ['Download a file', 'wget https://archlinux.org', 'Simulate downloading a remote resource.', 'wget takes the URL to fetch.'],
      ['Inspect listening sockets', 'ss -tuln', 'List simulated TCP and UDP listening sockets.', 'Use ss with TCP, UDP, listening, and numeric flags.'],
      ['Resolve a domain', 'nslookup archlinux.org', 'Look up the simulated address for a hostname.', 'Pass the domain name to nslookup.'],
      ['Inspect routes', 'ip route', 'Display the simulated routing table.', 'Ask ip for the route view.'],
      ['Check local identity', 'hostname', 'Confirm the configured system hostname.', 'The hostname command prints the current name.']
    ]
  },
  {
    id: 'services', title: 'Systemd & Services', lessons: [
      ['List service units', 'systemctl list-units', 'List simulated systemd units and their states.', 'systemctl provides the unit listing subcommand.'],
      ['Inspect SSH service', 'systemctl status sshd', 'Read the current status of the sshd service.', 'Use status followed by a unit name.'],
      ['Start SSH service', 'systemctl start sshd', 'Start the simulated sshd service.', 'Use start with the unit name.'],
      ['Enable SSH at boot', 'systemctl enable sshd', 'Enable sshd for future simulated boots.', 'Use enable with the unit name.'],
      ['Stop SSH service', 'systemctl stop sshd', 'Stop the simulated sshd service.', 'Use stop with the unit name.'],
      ['Read recent logs', 'journalctl -n 10', 'Display the latest ten simulated journal entries.', 'journalctl supports the line count option.'],
      ['Inspect time settings', 'timedatectl', 'Read the system clock and timezone configuration.', 'Run timedatectl without arguments.'],
      ['Inspect locale', 'localectl', 'Read locale and keyboard configuration.', 'Run localectl without arguments.']
    ]
  },
  {
    id: 'install', title: 'Install Arch & Scripting', lessons: [
      ['Inspect virtual disks', 'lsblk', 'List simulated block devices and partitions.', 'Use lsblk with no arguments.'],
      ['Review partition table', 'fdisk -l', 'List simulated partition tables.', 'fdisk uses -l for a read-only listing.'],
      ['Format the practice partition', 'mkfs.ext4 /dev/vda1', 'Format the simulated first virtual partition.', 'The simulator never touches a real disk.'],
      ['Mount the target root', 'mount /dev/vda1 /mnt', 'Mount the virtual partition at /mnt.', 'mount takes a device and mount point.'],
      ['Generate an fstab', 'genfstab -U /mnt', 'Print UUID-based mount entries for the target root.', 'genfstab accepts the target path and -U.'],
      ['Install base packages', 'pacstrap /mnt base linux', 'Simulate installing the base system into /mnt.', 'pacstrap takes the target root then package names.'],
      ['Enter the target system', 'arch-chroot /mnt', 'Simulate entering the installed system root.', 'arch-chroot takes the target root.'],
      ['Build a shell loop', 'for item in one two; do echo $item; done', 'Run a small loop that prints each value.', 'Use for, in, semicolons, do, and done.']
    ]
  }
]

export const lessonLevels: LessonLevel[] = levelSeeds.map(level => ({
  id: level.id,
  title: level.title,
  lessons: level.lessons.map(([title, command, explanation, hint], index) => ({
    id: `${level.id}-${index + 1}`,
    title,
    command,
    explanation,
    goal: `Run the command and verify the result in the terminal.`,
    hints: [hint, `Try: ${command.split(' ').slice(0, 2).join(' ')} …`, `The full command is ${command}.`],
    solution: command
  }))
}))