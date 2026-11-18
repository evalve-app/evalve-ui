# Issue tracker: Shortcut

Work for all Evalve repos lives in Shortcut, workspace `team-4-1` (https://app.shortcut.com/team-4-1). Use the Shortcut MCP connector tools (`mcp__claude_ai_Shortcut__*`; load their schemas with ToolSearch). Do not create GitHub issues. The old `evalve-ui` GitHub issues are read-only history.

The shape is: **epic → story → sub-task**. A story is a unit of work the team plans. A story's body is its spec. Sub-tasks are the implementation tickets of one story.

## Conventions

- **Read a story**: `get_story` with `fields` (always pass `fields`; the full record is large). Comments: `list_story_comments`.
- **List an epic's stories**: `list_epic_stories` with a narrow `fields` list.
- **Create a story**: `create_story` with `epic_id`, the epic's `ms:` label and one `repo:<name>` label for each repo it touches.
- **Create a sub-task**: `create_story` with `parent_story_id` set to the story. Give it the same `ms:` label and the `repo:` label of the one repo it is built in.
- **Comment**: `create_story_comment`.
- **Labels**: `update_story` with `label_ids_add` / `label_ids_remove`. Find ids with `list_labels`; create a missing label with `create_label`.
- **Blocking**: native story links. `create_story_link` with verb `blocks`: the subject blocks the object. A story is unblocked when each story that blocks it is Done. The connector cannot delete a link: ask the user to remove it in the UI.
- **Claim**: `update_story` with `owner_ids_add: ["me"]`, and move the story to In Progress.
- **Close**: move the story to Done.
- **Workflow states** (workflow "Standard"): Backlog `500000006`, To Do `500000007`, In Progress `500000008`, In Review `500000009`, Done `500000010`.

## Git and pull requests

Shortcut's GitHub integration attaches branches, commits and PRs to a story by its id.

- Name the branch with the id: `<name>/sc-<id>/<short-slug>`.
- Put `[sc-<id>]` in the PR title, and the story URL in the PR body.
- A PR links to stories only. To point at an epic, paste its URL as a plain link.

## When a skill says "publish to the issue tracker"

- **A spec (`/to-spec`)**: if the work started from an existing story, rewrite that story's description with the spec, and keep its existing links and labels. Do not create a second story. If there is no source story, create a story in the relevant epic. Apply `ready-for-agent`.
- **Tickets (`/to-tickets`)**: create each ticket as a sub-task of the source story, blockers first, then wire `blocks` links between them. Apply `ready-for-agent`. If a story outside the source story waits for one specific ticket, point its `blocks` link at that sub-task. Do not close or change the parent story's state.
- **A single small story** needs no sub-tasks: implement it on the story itself.

## When a skill says "fetch the relevant ticket"

`get_story` with the id from the URL or from `sc-<id>`, with `fields` that include `name`, `description`, `labels`, `story_links` and `sub_task_stories`. Read the comments as well.

## Pull requests as a triage surface

**PRs as a request surface: no.**

## Wayfinding operations

Used by `/wayfinder`. The **map** is one story in the epic; **tickets** are stories in the same epic.

- **Map**: a story labelled `wayfinder:map`, holding the Destination / Notes / Decisions-so-far / fog body. The map for epic 26 is story 309.
- **Ticket**: a story in the same epic with one label `wayfinder:research`, `wayfinder:grilling`, `wayfinder:prototype` or `wayfinder:task`. Tickets carry no triage label.
- **Blocking**: native `blocks` links, as above.
- **Frontier**: stories in the epic with a `wayfinder:<type>` label that are not Done, have no owner, and have no open blocker. First by position wins.
- **Claim**: add yourself as owner before any work.
- **Resolve**: post the answer as a story comment, move the story to Done, then add one line (gist + link) to the map's Decisions-so-far.
