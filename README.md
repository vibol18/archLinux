# ArchLab

ArchLab is a browser-based Arch Linux learning environment. Shell commands run in a Web Worker against an isolated in-memory virtual filesystem. The filesystem is persisted in IndexedDB; lesson progress, XP, and interface preferences stay in localStorage. No command reaches the host operating system or executes on a server.

## Setup

Requirements: Node.js 20.19+ or 22.12+.

```sh
npm install
npm run dev
```

Use `npm run build` to type-check and create the static production bundle, `npm test` to run Vitest, and `npm run lint` to run Oxlint. The Vite PWA plugin creates the service worker during production builds. The output in `dist/` can be deployed to Vercel, Netlify, or GitHub Pages.

## Shell Architecture

- `src/shell/parser.ts` tokenizes quotes, escapes, pipes, redirects, and command-list operators.
- `src/workers/shell.worker.ts` owns shell variables, simulated services and packages, command execution, and IndexedDB hydration/persistence.
- `src/fs/VirtualFS.ts` implements the virtual tree, permissions, snapshots, and filesystem mutations.
- `src/commands/index.ts` dispatches file and text commands through the shared `CommandContext` in `src/types/index.ts`.
- `src/pkgdb/catalog.ts` and `src/lessons/catalog.ts` are loaded on demand.
- `src/terminal/Terminal.tsx` connects xterm.js input and output to the worker.

All network, service, package, disk, and installation operations are deterministic simulations. They do not access the internet, install host packages, or modify real disks. The optional v86 real-Linux environment is not part of this build.

## Add a Command

Add or extend a case in `src/commands/index.ts`. A command receives its arguments and a `CommandContext`; use `ctx.fs` for virtual files, `ctx.write` for standard output, and `ctx.error` for standard error. Return `0` for success and a nonzero status for failure. Add the command to the worker's completion list in `src/workers/shell.worker.ts`, then cover behavior in `src/commands/commands.test.ts`.

Example:

```ts
case 'mycommand':
  ctx.write('ready\n')
  return 0
```

## Add a Lesson

Add a lesson tuple to the appropriate level in `src/lessons/catalog.ts`:

```ts
['Lesson title', 'command --flag', 'A short explanation.', 'A useful first hint.']
```

Each lesson gets a goal, three progressive hints, and a solution. The Learn validator awards XP when the exact task command exits successfully. Keep tasks within the simulator's supported command set and add tests when a new command is introduced.

## Tests

The Vitest suite covers parser operators and quoting, filesystem mutations and IndexedDB snapshot serialization, key command behavior, permission checks, and package-catalog size.