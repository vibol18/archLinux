import type { ShellCommand, ShellOperator, ShellPipeline, ShellToken } from '@/types'

const operators: ShellOperator[] = ['&&', '||', '>>', '2>', '|', ';', '&', '>', '<']

export function tokenize(line: string): ShellToken[] {
  const tokens: ShellToken[] = []
  let value = ''
  let quote: 'single' | 'double' | null = null
  let escaped = false

  const pushValue = () => {
    if (value) tokens.push({ value })
    value = ''
  }

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]
    if (escaped) {
      value += character
      escaped = false
      continue
    }
    if (character === '\\' && quote !== 'single') {
      escaped = true
      continue
    }
    if (quote === 'single') {
      if (character === "'") quote = null
      else value += character
      continue
    }
    if (quote === 'double') {
      if (character === '"') quote = null
      else value += character
      continue
    }
    if (character === "'") {
      quote = 'single'
      continue
    }
    if (character === '"') {
      quote = 'double'
      continue
    }
    if (/\s/.test(character)) {
      pushValue()
      continue
    }

    const operator = operators.find(candidate => line.startsWith(candidate, index))
    if (operator) {
      pushValue()
      tokens.push({ value: operator, operator })
      index += operator.length - 1
      continue
    }
    value += character
  }
  if (escaped) value += '\\'
  pushValue()
  return tokens
}

export function parseShell(line: string): ShellPipeline[] {
  const tokens = tokenize(line)
  const result: ShellPipeline[] = []
  let commands: ShellCommand[] = []
  let current: ShellCommand = { args: [] }
  let condition: '&&' | '||' | undefined
  let background = false

  const finishCommand = () => {
    if (current.args.length || current.redirectIn || current.redirectOut || current.redirectErr) commands.push(current)
    current = { args: [] }
  }
  const finishPipeline = () => {
    finishCommand()
    if (commands.length) {
      const pipeline: ShellPipeline = { commands }
      if (condition) pipeline.condition = condition
      if (background) pipeline.background = true
      result.push(pipeline)
    }
    commands = []
    condition = undefined
    background = false
  }

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index]
    if (!token.operator) {
      current.args.push(token.value)
      continue
    }
    if (token.value === '>' || token.value === '>>' || token.value === '<' || token.value === '2>') {
      const path = tokens[index + 1]
      if (path && !path.operator) {
        const redirect: Partial<ShellCommand> = {}
        if (token.value === '>') redirect.redirectOut = path.value
        if (token.value === '>>') {
          redirect.redirectOut = path.value
          redirect.redirectOutAppend = true
        }
        if (token.value === '<') redirect.redirectIn = path.value
        if (token.value === '2>') redirect.redirectErr = path.value
        Object.assign(current, redirect)
        index += 1
      }
      continue
    }
    finishCommand()
    if (token.value === '|') continue
    if (token.value === '&&' || token.value === '||') {
      finishPipeline()
      condition = token.value
      continue
    }
    if (token.value === ';' || token.value === '&') {
      background = token.value === '&'
      finishPipeline()
    }
  }
  finishPipeline()
  return result
}
