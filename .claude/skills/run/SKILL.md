---
name: run
description: Start the evalve-ui dev server and take a signed-in screenshot of a route. Use to see a change in the browser, or to get a screenshot as evidence for a PR.
---

# Run evalve-ui

1. Start the dev server in the background: `npm run dev`. It serves `http://localhost:5173` and forwards `/api` to the Kitaru server in `KITARU_URL`.
2. Take a screenshot of the route: `npm run screenshot -- "<route>" <file.png>`. Quote a route that has a query string. Save the file outside the repo.
3. Read the PNG, and read the `console error:` lines that the command prints.
4. Stop the dev server.

Done when the screenshot shows the changed page with real data, or you state which step failed.

## Limits

- Exit code 2 means that `KITARU_TEST_USERNAME` and `KITARU_TEST_PASSWORD` are not in `.env.local`. Only the user can supply them. Report that the browser check was not done.
- The script only reads pages. For a page that changes data ("Run again", "Approve device"), take the screenshot and leave the button to a person.
- `/devices/verify` needs a link from a real `kitaru login`. Without one, the page shows only its "not found" state.
