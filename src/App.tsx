import { useEffect, useMemo, useRef, useState } from 'react'
import { Terminal } from './terminal/Terminal'
import type { Lesson, LessonLevel } from './lessons/catalog'
import './App.css'

type Mode = 'learn' | 'sandbox'
type PanelTab = 'guide' | 'explain' | 'cheatsheet' | 'quiz'
const dailyChallengeCommand = 'find /etc -name "*.conf"'
const dailyChallengeKey = `archlab.daily.${new Date().toISOString().slice(0, 10)}`

const commandNotes = [
  ['pwd', 'Print the current working directory'], ['ls', 'List directory contents'], ['cd', 'Change directory'],
  ['cat', 'Read file contents'], ['mkdir', 'Create directories'], ['touch', 'Create empty files'],
  ['cp', 'Copy files or directories'], ['mv', 'Move or rename files'], ['rm', 'Remove files and directories'],
  ['chmod', 'Change file permissions'], ['find', 'Search for files by name'], ['grep', 'Search text with patterns'],
  ['head', 'Print the first lines of a file'], ['tail', 'Print the last lines of a file'], ['wc', 'Count lines, words, and bytes'],
  ['sort', 'Sort lines of text'], ['uniq', 'Filter adjacent duplicate lines'], ['cut', 'Extract fields from each line'],
  ['tr', 'Translate or delete characters'], ['stat', 'Show file metadata'], ['pacman', 'Manage Arch packages'],
  ['systemctl', 'Control systemd units'], ['journalctl', 'Read the system journal'], ['ip', 'Show network configuration'],
  ['man', 'Read a command manual']
]

function readStoredStrings(key: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [])
  } catch {
    return new Set()
  }
}

function readStoredNumber(key: string, fallback: number): number {
  try {
    const value = Number(localStorage.getItem(key))
    return Number.isFinite(value) && value >= 0 ? value : fallback
  } catch {
    return fallback
  }
}

function readStoredFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'true'
  } catch {
    return false
  }
}

function commandBreakdown(command: string): Array<{ token: string; detail: string }> {
  const options: Record<string, string> = {
    '-a': 'include hidden entries or show all information',
    '-l': 'use the long listing format',
    '-h': 'print sizes in human-readable units',
    '-R': 'operate recursively through subdirectories',
    '-p': 'create parent directories as needed',
    '-r': 'search or operate recursively',
    '-n': 'include line numbers or set a line count',
    '-f': 'force the operation without extra prompts',
    '-S': 'synchronize and install packages',
    '-y': 'refresh package databases',
    '-u': 'upgrade installed packages',
    '>': 'redirect standard output, replacing the file',
    '>>': 'append standard output to the file',
    '|': 'send one command’s output to the next command'
  }
  return command.match(/\$\?\b|&&|\|\||>>|2>|[|;&<>]|[^\s]+/g)?.map((token, index) => ({
    token,
    detail: index === 0 ? `run the ${token} program` : options[token] ?? (token.startsWith('-') ? 'option passed to the command' : 'argument or path passed to the command')
  })) ?? []
}

function App() {
  const [mode, setMode] = useState<Mode>(() => localStorage.getItem('archlab.mode') === 'sandbox' ? 'sandbox' : 'learn')
  const [panelTab, setPanelTab] = useState<PanelTab>('guide')
  const [levels, setLevels] = useState<LessonLevel[]>([])
  const [selectedLevelId, setSelectedLevelId] = useState('basics')
  const [selectedLessonId, setSelectedLessonId] = useState('basics-1')
  const [completed, setCompleted] = useState(() => readStoredStrings('archlab.completed'))
  const [xp, setXp] = useState(() => readStoredNumber('archlab.xp', 0))
  const [lastCommand, setLastCommand] = useState('')
  const [lastStatus, setLastStatus] = useState(0)
  const [terminalPath, setTerminalPath] = useState('/home/archuser')
  const pendingLessonRef = useRef('')
  const [hintLevel, setHintLevel] = useState(0)
  const [solutionVisible, setSolutionVisible] = useState(false)
  const [search, setSearch] = useState('')
  const [fontSize, setFontSize] = useState(() => Math.min(18, Math.max(11, readStoredNumber('archlab.fontSize', 13))))
  const [highContrast, setHighContrast] = useState(() => readStoredFlag('archlab.highContrast'))
  const [dailyComplete, setDailyComplete] = useState(() => readStoredFlag(dailyChallengeKey))
  const [commandSuggestion, setCommandSuggestion] = useState({ line: '', key: 0 })
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [rightOpen, setRightOpen] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)
  const [quizAnswer, setQuizAnswer] = useState('')
  const [quizMessage, setQuizMessage] = useState('')
  const [quizChoice, setQuizChoice] = useState('')
  const [quizChoiceMessage, setQuizChoiceMessage] = useState('')

  useEffect(() => {
    let active = true
    void import('./lessons/catalog').then(module => {
      if (!active) return
      setLevels(module.lessonLevels)
      setSelectedLessonId(current => current || module.lessonLevels[0]?.lessons[0]?.id || '')
    })
    return () => { active = false }
  }, [])

  useEffect(() => {
    localStorage.setItem('archlab.mode', mode)
  }, [mode])

  useEffect(() => {
    localStorage.setItem('archlab.completed', JSON.stringify([...completed]))
  }, [completed])

  useEffect(() => {
    localStorage.setItem('archlab.xp', String(xp))
  }, [xp])

  useEffect(() => {
    localStorage.setItem('archlab.fontSize', String(fontSize))
  }, [fontSize])

  useEffect(() => {
    localStorage.setItem('archlab.highContrast', String(highContrast))
  }, [highContrast])

  useEffect(() => {
    localStorage.setItem(dailyChallengeKey, String(dailyComplete))
  }, [dailyComplete])

  useEffect(() => {
    if (!sidebarOpen && !rightOpen && !resetDialogOpen) return
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false)
        setRightOpen(false)
        setResetDialogOpen(false)
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [sidebarOpen, rightOpen, resetDialogOpen])

  const allLessons = useMemo(() => levels.flatMap(level => level.lessons), [levels])
  const activeLevel = levels.find(level => level.id === selectedLevelId) ?? levels[0]
  const activeLesson = allLessons.find(lesson => lesson.id === selectedLessonId)
  const overallPercent = allLessons.length ? Math.round(completed.size / allLessons.length * 100) : 0
  const filteredCommands = commandNotes.filter(([name, description]) => `${name} ${description}`.toLowerCase().includes(search.toLowerCase()))
  const breakdown = commandBreakdown(lastCommand)

  const chooseLevel = (level: LessonLevel) => {
    setSelectedLevelId(level.id)
    setSelectedLessonId(level.lessons[0]?.id ?? '')
    setHintLevel(0)
    setSolutionVisible(false)
    setQuizAnswer('')
    setQuizMessage('')
    setSidebarOpen(false)
  }

  const submitCommand = (line: string) => {
    setLastCommand(line)
    pendingLessonRef.current = selectedLessonId
    setCommandSuggestion(previous => ({ ...previous, line: '' }))
  }

  const suggestCommand = (line: string) => {
    setMode('sandbox')
    setCommandSuggestion(previous => ({ line, key: previous.key + 1 }))
    setRightOpen(false)
  }

  const receiveStatus = (status: number) => {
    setLastStatus(status)
    const target = allLessons.find(lesson => lesson.id === pendingLessonRef.current)
    if (mode === 'learn' && target && status === 0 && lastCommand.trim() === target.command && !completed.has(target.id)) {
      setCompleted(previous => new Set(previous).add(target.id))
      setXp(previous => previous + 25)
      setQuizMessage('Lesson complete. +25 XP')
    } else if (mode === 'sandbox' && status === 0 && lastCommand.trim() === dailyChallengeCommand && !dailyComplete) {
      setDailyComplete(true)
      setXp(previous => previous + 50)
    }
  }

  const selectLesson = (lesson: Lesson) => {
    setSelectedLessonId(lesson.id)
    setHintLevel(0)
    setSolutionVisible(false)
    setQuizAnswer('')
    setQuizMessage('')
    setSidebarOpen(false)
  }

  const checkQuiz = () => {
    if (!activeLesson) return
    if (quizAnswer.trim() === activeLesson.command) {
      setQuizMessage('Correct. +10 XP')
      setXp(previous => previous + 10)
    } else {
      setQuizMessage('Not quite. Check the command in the lesson guide.')
    }
  }

  const checkMultipleChoice = () => {
    if (quizChoice === 'working-directory') {
      setQuizChoiceMessage('Correct. +5 XP')
      setXp(previous => previous + 5)
    } else {
      setQuizChoiceMessage('Not quite. pwd prints the current working directory.')
    }
  }

  const resetSystem = () => {
    setResetDialogOpen(true)
  }

  const confirmSystemReset = () => {
    pendingLessonRef.current = ''
    setLastCommand('')
    setLastStatus(0)
    setResetSignal(signal => signal + 1)
    setResetDialogOpen(false)
  }

  return (
    <main className={`app-shell${highContrast ? ' high-contrast' : ''}`}>
      <header className="topbar">
        <button className="mobile-panel-toggle" onClick={() => { setSidebarOpen(open => !open); setRightOpen(false) }} aria-label="Toggle lesson navigation" aria-expanded={sidebarOpen}>≡</button>
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">A</span>
          <span className="brand-name">Arch<span>Lab</span></span>
          <span className="brand-divider" />
          <span className="brand-caption">LINUX PRACTICE ENVIRONMENT</span>
        </div>
        <div className="topbar-right">
          <div className="session-indicator"><i /> virtual machine online</div>
          <div className="xp-counter"><span>XP</span> {xp}</div>
          <button className="mobile-panel-toggle" onClick={() => { setRightOpen(open => !open); setSidebarOpen(false) }} aria-label="Toggle command guide" aria-expanded={rightOpen}>?</button>
        </div>
      </header>

      <div className="workspace-grid">
        {(sidebarOpen || rightOpen) && <button className="drawer-backdrop" onClick={() => { setSidebarOpen(false); setRightOpen(false) }} aria-label="Close open panel" />}
        <aside className={`lesson-sidebar${sidebarOpen ? ' is-open' : ''}`}>
          <div className="sidebar-summary">
            <div className="eyebrow">YOUR WORKSPACE</div>
            <div className="sidebar-user"><span className="user-avatar">au</span><span><strong>archuser</strong><small>learner account</small></span><span className="online-dot" /></div>
            <div className="progress-copy"><span>Learning progress</span><strong>{overallPercent}%</strong></div>
            <div className="progress-track"><span style={{ width: `${overallPercent}%` }} /></div>
          </div>
          <nav className="level-navigation" aria-label="Lesson levels">
            <div className="nav-heading"><span>CURRICULUM</span><span>{completed.size}/{allLessons.length}</span></div>
            {levels.map((level, index) => {
              const done = level.lessons.filter(lesson => completed.has(lesson.id)).length
              const selected = level.id === selectedLevelId
              return (
                <section className={`level-section${selected ? ' selected' : ''}`} key={level.id}>
                  <button className="level-button" onClick={() => chooseLevel(level)} aria-expanded={selected}>
                    <span className="level-number">{String(index + 1).padStart(2, '0')}</span>
                    <span className="level-name">{level.title}</span>
                    <span className="level-count">{done}/{level.lessons.length}</span>
                    <span className="level-chevron">{selected ? '−' : '+'}</span>
                  </button>
                  {selected && <div className="lesson-list">
                    {level.lessons.map((lesson, lessonIndex) => (
                      <button key={lesson.id} className={`lesson-link${lesson.id === selectedLessonId ? ' active' : ''}`} onClick={() => selectLesson(lesson)}>
                        <span className={`lesson-state${completed.has(lesson.id) ? ' done' : ''}`}>{completed.has(lesson.id) ? '✓' : String(lessonIndex + 1).padStart(2, '0')}</span>
                        <span>{lesson.title}</span>
                      </button>
                    ))}
                  </div>}
                </section>
              )
            })}
          </nav>
          <div className="sidebar-footer">
            <div className="daily-label">TODAY'S CHALLENGE <span>+50 XP</span></div>
            <p>Find every <code>.conf</code> file under <code>/etc</code>.</p>
            <button className="daily-button" disabled={dailyComplete} onClick={() => suggestCommand(dailyChallengeCommand)}>{dailyComplete ? 'Challenge complete' : 'Start challenge'} <span>{dailyComplete ? '✓' : '↗'}</span></button>
            <div className="badges-row" aria-label="Badges"><span className={completed.size > 0 ? 'earned' : ''} title="First command">01</span><span className={completed.size >= 8 ? 'earned' : ''} title="Level complete">08</span><span className={xp >= 250 ? 'earned' : ''} title="250 XP">XP</span></div>
          </div>
        </aside>

        <section className="main-column">
          <div className="workbench-toolbar">
            <div className="mode-switch" role="tablist" aria-label="Terminal mode">
              <button role="tab" aria-selected={mode === 'learn'} className={mode === 'learn' ? 'active' : ''} onClick={() => setMode('learn')}>Learn</button>
              <button role="tab" aria-selected={mode === 'sandbox'} className={mode === 'sandbox' ? 'active' : ''} onClick={() => setMode('sandbox')}>Sandbox</button>
            </div>
            <div className="crumbs"><span>ARCHLAB</span><b>/</b><span>{mode === 'learn' ? activeLevel?.title ?? 'Basics' : 'Free terminal'}</span><b>/</b><strong>{mode === 'learn' ? activeLesson?.title ?? 'Loading lessons' : 'Session 01'}</strong></div>
            <div className="toolbar-actions">
              <button className="text-action" onClick={() => setFontSize(size => Math.max(11, size - 1))} aria-label="Decrease terminal font size">A−</button>
              <button className="text-action" onClick={() => setFontSize(size => Math.min(18, size + 1))} aria-label="Increase terminal font size">A+</button>
              <button className={`contrast-toggle${highContrast ? ' active' : ''}`} onClick={() => setHighContrast(!highContrast)} aria-pressed={highContrast} aria-label="Toggle high contrast" title="Toggle high contrast">◐</button>
            </div>
          </div>

          {mode === 'learn' && activeLesson && <div className="task-strip">
            <div className="task-index">{String((activeLevel?.lessons.findIndex(lesson => lesson.id === activeLesson.id) ?? 0) + 1).padStart(2, '0')}<span> / {String(activeLevel?.lessons.length ?? 0).padStart(2, '0')}</span></div>
            <div className="task-copy"><div className="eyebrow">CURRENT EXERCISE</div><strong>{activeLesson.title}</strong><p>{activeLesson.goal}</p></div>
            <button className="task-guide-button" onClick={() => { setPanelTab('guide'); setRightOpen(true) }}>View guide <span>↗</span></button>
          </div>}

          <section className="terminal-frame" aria-label="Terminal workspace">
            <header className="terminal-titlebar">
              <div className="window-controls" aria-hidden="true"><i /><i /><i /></div>
              <div className="terminal-tab"><span className="terminal-tab-icon">›_</span> archlinux <i /></div>
              <div className="terminal-actions"><span className="terminal-location">{terminalPath}</span><button className="reset-system-button" onClick={resetSystem}>Reset system</button><button onClick={() => window.location.reload()} title="Restart terminal session" aria-label="Restart terminal session">↻</button></div>
            </header>
            <div className="terminal-content"><Terminal onCommand={submitCommand} onStatusChange={receiveStatus} onCwdChange={setTerminalPath} fontSize={fontSize} resetSignal={resetSignal} suggestion={commandSuggestion.line} suggestionKey={commandSuggestion.key} /></div>
            <footer className="terminal-status"><span><i /> SIMULATED ARCH LINUX</span><span>bash · UTF-8</span><span>WORKER ISOLATED</span></footer>
          </section>

          <div className="bottom-strip">
            <div><span className="bottom-label">LAST COMMAND</span><code>{lastCommand || '—'}</code></div>
            <div><span className="bottom-label">EXIT STATUS</span><code className={lastStatus === 0 ? 'status-ok' : 'status-error'}>{lastStatus}</code></div>
            <div className="bottom-shortcuts"><span>↑↓ <small>history</small></span><span>Tab <small>complete</small></span><span>Ctrl+C <small>interrupt</small></span></div>
          </div>
        </section>

        <aside className={`context-panel${rightOpen ? ' is-open' : ''}`}>
          <div className="panel-tabs" role="tablist" aria-label="Reference panels">
            {([['guide', 'Guide'], ['explain', 'Explain'], ['cheatsheet', 'Commands'], ['quiz', 'Quiz']] as Array<[PanelTab, string]>).map(([tab, label]) => (
              <button key={tab} role="tab" aria-selected={panelTab === tab} className={panelTab === tab ? 'active' : ''} onClick={() => setPanelTab(tab)}>{label}</button>
            ))}
          </div>
          <div className="panel-content">
            {panelTab === 'guide' && <>
              {mode === 'sandbox' ? <div className="panel-empty"><span className="panel-kicker">SANDBOX</span><h2>Open terminal.</h2><p>Try commands freely. Changes are isolated to this browser-based virtual system.</p><div className="quick-starts" aria-label="Quick-start commands"><button onClick={() => suggestCommand('pwd')}>pwd <span>location</span></button><button onClick={() => suggestCommand('ls -lah')}>ls -lah <span>list files</span></button><button onClick={() => suggestCommand('help')}>help <span>commands</span></button></div><button className="outline-button" onClick={() => setPanelTab('cheatsheet')}>Browse commands</button></div> : activeLesson ? <>
                <div className="panel-kicker">{activeLevel?.title.toUpperCase()} · LESSON {String((activeLevel?.lessons.findIndex(lesson => lesson.id === activeLesson.id) ?? 0) + 1).padStart(2, '0')}</div>
                <h2>{activeLesson.title}</h2>
                <p className="guide-description">{activeLesson.explanation}</p>
                <div className="goal-block"><span>YOUR GOAL</span><p>{activeLesson.goal}</p></div>
                <div className="task-code"><span>TYPE THIS COMMAND</span><code>{activeLesson.command}</code></div>
                <div className="hint-heading"><span>HINTS</span><span>{hintLevel}/3</span></div>
                {hintLevel > 0 && <p className="hint-copy">{activeLesson.hints[hintLevel - 1]}</p>}
                <button className="outline-button full-width" onClick={() => setHintLevel(level => Math.min(3, level + 1))} disabled={hintLevel >= 3}>Reveal a hint <span>{hintLevel >= 3 ? 'All shown' : `${hintLevel + 1}/3`}</span></button>
                <button className="solution-button" onClick={() => setSolutionVisible(!solutionVisible)}>{solutionVisible ? 'Hide solution' : 'Show solution'} <span>{solutionVisible ? '−' : '+'}</span></button>
                {solutionVisible && <pre className="solution-code">{activeLesson.solution}</pre>}
                {completed.has(activeLesson.id) && <div className="completed-banner">✓ Exercise complete · 25 XP earned</div>}
              </> : <p className="guide-description">Loading lesson library…</p>}
            </>}

            {panelTab === 'explain' && <>
              <div className="panel-kicker">COMMAND ANALYSIS</div>
              <h2>Explain this command</h2>
              {lastCommand ? <>
                <div className="explain-command"><code>{lastCommand}</code><span className={lastStatus === 0 ? 'status-ok' : 'status-error'}>exit {lastStatus}</span></div>
                <div className="token-list">{breakdown.map((part, index) => <div className="token-row" key={`${part.token}-${index}`}><code>{part.token}</code><span>{part.detail}</span></div>)}</div>
              </> : <p className="guide-description">Run a command in the terminal to see its parts explained here.</p>}
            </>}

            {panelTab === 'cheatsheet' && <>
              <div className="panel-kicker">QUICK REFERENCE</div>
              <h2>Command index</h2>
              <label className="command-search"><span aria-hidden="true">⌕</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search commands" /></label>
              <div className="command-list">{filteredCommands.map(([name, description], index) => <div className="command-row" key={`${name}-${index}`}><div><code>{name}</code><span>{description}</span></div><button onClick={() => void navigator.clipboard?.writeText(name)} aria-label={`Copy ${name}`} title="Copy command">⧉</button></div>)}</div>
            </>}

            {panelTab === 'quiz' && <>
              <div className="panel-kicker">TYPE THE COMMAND</div>
              <h2>Quick check</h2>
              <p className="guide-description">What command completes “{activeLesson?.goal ?? 'the current task'}”?</p>
              <label className="quiz-input-label" htmlFor="quiz-answer">Your command</label>
              <input id="quiz-answer" className="quiz-input" value={quizAnswer} onChange={event => setQuizAnswer(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') checkQuiz() }} placeholder="type a command" />
              <button className="outline-button full-width" onClick={checkQuiz}>Check answer <span>↵</span></button>
              {quizMessage && <p className="quiz-message">{quizMessage}</p>}
              <div className="quiz-divider" />
              <div className="panel-kicker">MULTIPLE CHOICE</div>
              <p className="guide-description">What does <code>pwd</code> print?</p>
              <div className="choice-list" role="group" aria-label="Choose the purpose of pwd">
                {[
                  ['directory-contents', 'The files in the current directory'],
                  ['working-directory', 'The current working directory'],
                  ['account-name', 'The active account name']
                ].map(([value, label]) => <button key={value} className={`choice-option${quizChoice === value ? ' selected' : ''}`} aria-pressed={quizChoice === value} onClick={() => setQuizChoice(value)}>{label}</button>)}
              </div>
              <button className="outline-button full-width" onClick={checkMultipleChoice}>Check choice <span>+5 XP</span></button>
              {quizChoiceMessage && <p className="quiz-message">{quizChoiceMessage}</p>}
              <div className="quiz-divider" />
              <div className="panel-kicker">SESSION AWARDS</div>
              <div className="award-line"><span>Exercises completed</span><strong>{completed.size}</strong></div>
              <div className="award-line"><span>Total experience</span><strong>{xp} XP</strong></div>
            </>}
          </div>
          <footer className="panel-footer"><button onClick={() => { setPanelTab('guide'); setMode('learn') }}>Return to lesson</button><span>ARCHLAB / 0.1</span></footer>
        </aside>
      </div>
      {resetDialogOpen && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setResetDialogOpen(false) }}>
        <section className="reset-dialog" role="alertdialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-description">
          <span className="panel-kicker">SYSTEM CONTROL</span>
          <h2 id="reset-title">Reset virtual system?</h2>
          <p id="reset-description">Files, installed packages, and service state will be cleared. Your lesson progress and XP will remain.</p>
          <div className="reset-dialog-actions"><button className="outline-button" onClick={() => setResetDialogOpen(false)}>Cancel</button><button className="danger-button" onClick={confirmSystemReset}>Reset system</button></div>
        </section>
      </div>}
    </main>
  )
}

export default App