import { describe, expect, it } from 'vitest'
import { parseShell, tokenize } from './parser'

describe('shell tokenizer', () => {
  it('preserves quoted arguments and escaped spaces', () => {
    expect(tokenize(`echo "two words" a\\ b`)).toEqual([
      { value: 'echo' }, { value: 'two words' }, { value: 'a b' }
    ])
  })

  it('recognizes shell operators from longest to shortest', () => {
    expect(tokenize('echo ok 2> errors >> out && cat < out | grep ok; true')).toEqual([
      { value: 'echo' }, { value: 'ok' }, { value: '2>', operator: '2>' },
      { value: 'errors' }, { value: '>>', operator: '>>' }, { value: 'out' },
      { value: '&&', operator: '&&' }, { value: 'cat' }, { value: '<', operator: '<' },
      { value: 'out' }, { value: '|', operator: '|' }, { value: 'grep' },
      { value: 'ok' }, { value: ';', operator: ';' }, { value: 'true' }
    ])
  })
})

describe('shell parser', () => {
  it('builds pipelines, redirects, and conditional lists', () => {
    expect(parseShell('echo hello > note.txt && cat < note.txt | wc -l; false || echo done')).toEqual([
      { commands: [{ args: ['echo', 'hello'], redirectOut: 'note.txt' }] },
      { condition: '&&', commands: [{ args: ['cat'], redirectIn: 'note.txt' }, { args: ['wc', '-l'] }] },
      { commands: [{ args: ['false'] }] },
      { condition: '||', commands: [{ args: ['echo', 'done'] }] }
    ])
  })

  it('marks background commands', () => {
    expect(parseShell('sleep 2 &')).toEqual([{ commands: [{ args: ['sleep', '2'] }], background: true }])
  })
})