import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import '@xterm/xterm/css/xterm.css'

interface ShellMessage {
  type: 'result' | 'completion' | 'interrupted' | 'reset'
  output?: string
  error?: string
  status?: number
  cwd?: string
  matches?: string[]
  username?: string
}

interface TerminalProps {
  onCommand?: (line: string) => void
  onStatusChange?: (status: number) => void
  onCwdChange?: (cwd: string) => void
  fontSize?: number
  resetSignal?: number
  suggestion?: string
  suggestionKey?: number
}

const blue = '\x1b[38;2;23;147;209m'
const reset = '\x1b[0m'

export function Terminal({ onCommand, onStatusChange, onCwdChange, fontSize = 13, resetSignal = 0, suggestion = '', suggestionKey = 0 }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const terminalInstanceRef = useRef<XTerm | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const initialFontSizeRef = useRef(fontSize)
  const lineRef = useRef('')
  const historyRef = useRef<string[]>([])
  const historyIndexRef = useRef(0)
  const cwdRef = useRef('/home/archuser')
  const usernameRef = useRef('archuser')
  const onCommandRef = useRef(onCommand)
  const onStatusChangeRef = useRef(onStatusChange)
  const onCwdChangeRef = useRef(onCwdChange)
  const suggestionWriterRef = useRef<(line: string) => void>(() => undefined)

  useEffect(() => {
    onCommandRef.current = onCommand
    onStatusChangeRef.current = onStatusChange
    onCwdChangeRef.current = onCwdChange
  }, [onCommand, onStatusChange, onCwdChange])

  useEffect(() => {
    if (!terminalRef.current) return
    const terminal = new XTerm({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, monospace',
      fontSize: initialFontSizeRef.current,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: {
        background: '#0B0D10', foreground: '#D8DEE9', cursor: '#1793D1',
        selectionBackground: '#1793D1', selectionForeground: '#0B0D10'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    const worker = new Worker(new URL('../workers/shell.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    terminal.open(terminalRef.current)
    terminalInstanceRef.current = terminal
    fitAddon.fit()
    let disposed = false
    const webglTimer = window.setTimeout(() => {
      if (disposed) return
      try {
        terminal.loadAddon(new WebglAddon())
      } catch {
        // Canvas rendering remains available when WebGL is unavailable.
      }
    }, 100)

    const prompt = () => {
      const path = cwdRef.current === '/home/archuser' ? '~' : cwdRef.current
      const marker = usernameRef.current === 'root' ? '#' : '$'
      terminal.write(`${blue}[${usernameRef.current}@archlinux${reset} ${path}]${marker} `)
    }
    suggestionWriterRef.current = line => {
      terminal.write('\r\x1b[2K')
      prompt()
      lineRef.current = line
      terminal.write(line)
      terminal.focus()
    }
    terminal.write(`${blue}ArchLab${reset} | Arch Linux 6.12.8-arch1-1 x86_64\r\n`)
    terminal.write(`${blue}      /\\        ${reset}archuser@archlinux\r\n`)
    terminal.write(`${blue}     /  \\       ${reset}-------------------\r\n`)
    terminal.write(`${blue}    /\\    \\      ${reset}OS: Arch Linux x86_64\r\n`)
    terminal.write(`${blue}   /      \\     ${reset}Kernel: 6.12.8-arch1-1\r\n`)
    terminal.write(`${blue}  /   ,,   \\    ${reset}Shell: bash 5.2.37\r\n`)
    terminal.write(`${blue} /   |  |   \\   ${reset}Packages: 142 (pacman)\r\n`)
    terminal.write(`${blue}/_-''    ''-_\\  ${reset}Type "help" to explore the simulator.\r\n\r\n`)
    prompt()

    worker.onmessage = (event: MessageEvent<ShellMessage>) => {
      const message = event.data
      if (message.type === 'reset') {
        lineRef.current = ''
        historyRef.current = []
        historyIndexRef.current = 0
        cwdRef.current = message.cwd ?? '/home/archuser'
        usernameRef.current = message.username ?? 'archuser'
        onCwdChangeRef.current?.(cwdRef.current)
        terminal.clear()
        terminal.write(`${blue}Virtual system reset.${reset}\r\n`)
        onStatusChangeRef.current?.(0)
        prompt()
      } else if (message.type === 'result') {
        if (message.output) terminal.write(message.output.replace(/\n/g, '\r\n'))
        if (message.error) terminal.write(`\x1b[31m${message.error.replace(/\n/g, '\r\n')}${reset}`)
        cwdRef.current = message.cwd ?? cwdRef.current
        usernameRef.current = message.username ?? usernameRef.current
        onCwdChangeRef.current?.(cwdRef.current)
        onStatusChangeRef.current?.(message.status ?? 0)
        prompt()
      } else if (message.type === 'completion') {
        const matches = message.matches ?? []
        if (matches.length === 1) {
          const current = lineRef.current.split(/\s/).at(-1) ?? ''
          const suffix = matches[0].slice(current.length)
          lineRef.current += suffix
          terminal.write(suffix)
        } else if (matches.length > 1) {
          terminal.write(`\r\n${matches.join('  ')}\r\n`)
          prompt()
          terminal.write(lineRef.current)
        }
      } else if (message.type === 'interrupted') {
        prompt()
      }
    }

    const replaceLine = (next: string) => {
      terminal.write('\r\x1b[2K')
      prompt()
      lineRef.current = next
      terminal.write(next)
    }
    const input = terminal.onData(data => {
      if (data === '\r') {
        const command = lineRef.current.trim()
        terminal.write('\r\n')
        lineRef.current = ''
        if (!command) {
          prompt()
          return
        }
        historyRef.current.push(command)
        historyIndexRef.current = historyRef.current.length
        onCommandRef.current?.(command)
        worker.postMessage({ type: 'run', line: command })
      } else if (data === '\u007f') {
        if (lineRef.current) {
          lineRef.current = lineRef.current.slice(0, -1)
          terminal.write('\b \b')
        }
      } else if (data === '\u0003') {
        lineRef.current = ''
        terminal.write('^C\r\n')
        worker.postMessage({ type: 'interrupt' })
      } else if (data === '\u000c') {
        terminal.clear()
        prompt()
      } else if (data === '\u0004') {
        if (!lineRef.current) terminal.write('\r\n')
      } else if (data === '\t') {
        worker.postMessage({ type: 'complete', input: lineRef.current })
      } else if (data === '\x1b[A') {
        if (historyIndexRef.current > 0) {
          historyIndexRef.current -= 1
          replaceLine(historyRef.current[historyIndexRef.current])
        }
      } else if (data === '\x1b[B') {
        if (historyIndexRef.current < historyRef.current.length - 1) {
          historyIndexRef.current += 1
          replaceLine(historyRef.current[historyIndexRef.current])
        } else if (historyIndexRef.current < historyRef.current.length) {
          historyIndexRef.current = historyRef.current.length
          replaceLine('')
        }
      } else if (data === '\x12') {
        const query = window.prompt('Search command history') ?? ''
        const match = [...historyRef.current].reverse().find(command => command.includes(query))
        if (match) replaceLine(match)
      } else if (data >= ' ' && data <= '~') {
        lineRef.current += data
        terminal.write(data)
      }
    })
    const handleResize = () => fitAddon.fit()
    const observer = new ResizeObserver(handleResize)
    observer.observe(terminalRef.current)
    window.addEventListener('resize', handleResize)

    return () => {
      disposed = true
      window.clearTimeout(webglTimer)
      observer.disconnect()
      window.removeEventListener('resize', handleResize)
      input.dispose()
      worker.terminate()
      workerRef.current = null
      suggestionWriterRef.current = () => undefined
      terminalInstanceRef.current = null
      terminal.dispose()
    }
  }, [])

  useEffect(() => {
    if (terminalInstanceRef.current) terminalInstanceRef.current.options.fontSize = fontSize
  }, [fontSize])

  useEffect(() => {
    if (resetSignal > 0) workerRef.current?.postMessage({ type: 'reset' })
  }, [resetSignal])

  useEffect(() => {
    if (suggestion) suggestionWriterRef.current(suggestion)
  }, [suggestion, suggestionKey])

  return <div ref={terminalRef} className="terminal-host" aria-label="Arch Linux terminal" />
}