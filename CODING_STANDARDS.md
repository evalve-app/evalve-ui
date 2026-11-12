# Coding standards

Rules for review. Each rule came from a review finding. Tooling covers types and tests (`npm run typecheck`, `npm test`, the Check workflow), so this file holds only judgement calls.

## Words

- User-facing text and names in code use the words in `GLOSSARY.md`, and none of its "Avoid" words.

## Documents agree with the diff

- `HANDOFF.md` agrees with the change: the "What's built" table, the placeholder list, and the sentence that lists the calls that change data.
- `docs/todo.md`: a completed item is crossed out (`~~…~~`), not removed.

## API client (`src/api/client.ts`)

- One function for each Kitaru call. Pages call these functions, not `api` directly.
- A function goes through `unwrap`, so a 401 throws `UnauthorizedError`. A function that does not use `unwrap` has a comment that gives the reason and says what a 401 does.
- A function that loads a list follows `next_cursor` to the end, or its comment states the limit.

## Queries

- One definition for each query key. If two files need the same query, they share the options from `src/lib` (see `cohortVersionsQuery` in `src/lib/useCohorts.ts`).

## Logic and tests

- Logic with no UI goes in `src/lib` as pure functions, with Vitest tests beside it. Pages hold layout and wiring.
- No component tests.
- Text that depends on a server answer (status, detail) comes from a function in `src/lib`, with a test for each case.

## Pages

- A row or a cell that opens a page holds a real link, so the keyboard and "open in new tab" work.
- Styles go in `src/app.css` in a section named for the page, and use design tokens only.
- A page shows a state for each of: load in progress, load failed, nothing found, and no data.
