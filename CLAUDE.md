# Project rules for Claude Code

## Git authorship

Never commit as `claude <noreply@anthropic.com>`. All commits in this repo are
authored by the human maintainer. Local git
config already sets this; do not override it with a Claude/Anthropic identity.

## No LLM smells in code or comments

Do not write code or comments with detectable LLM tells. Concretely:

- Plain ASCII punctuation everywhere: code, comments, docs, commit messages.
  No em dashes, en dashes, middle dots, or typographic ellipses. Use `-`, `,`,
  or `...`. Arrows (`->`) and literal UI glyphs are fine.
- No filler preambles in comments ("Note that...", "It's worth noting...",
  "This is important because...").
- No inflated adjectives ("comprehensive", "robust", "powerful", "seamless",
  "cutting-edge") used as filler rather than as a specific claim.
- No listy comment blocks that restate the obvious structure of the code below
  them.
- Match the terse, plain style already in this repo's docs (see
  `doc/PLAN.md`): direct statements, concrete facts, no hedging.

- Comments say what the code cannot: a constraint, a trap, a fact measured
  against real Ableton behavior. Not what the next line does. State it plainly,
  do not dramatize it ("this cost us a day" style framing is out).

This applies to everything committed: source, comments, docs, commit messages.

## Branching

**No trunk-based development. Never commit directly to `main`.**

**The maintainer decides when a branch starts and when it merges. Do not do
either unprompted.**

- **Branching is the maintainer's call.** Wait to be told a feature starts.
  Until then, work in the tree and leave it uncommitted, or ask.
- **Opening a PR is the maintainer's call.** Do not run `gh pr create`
  unprompted.
- **Merging and closing are the maintainer's call.** Never run `gh pr merge`
  or `gh pr close`. Green CI is not permission; it is a precondition for
  asking.

The PR summary's shape is not in question - it is the template below, so write
it that way without asking. The maintainer may then edit the body in the web
UI; that edit is the current one. Do not overwrite it with `gh pr edit` unless
asked.

Once a branch is asked for:

- `feat/<short-name>` for a feature, `fix/<short-name>` for a fix,
  `docs/<short-name>` for documentation.
- `release/<version>` for a version bump and its release notes.

Branch from an up-to-date `main` and commit there. Push and open the PR when
asked, then let CI run on it - both jobs, `check` and `browser` - report the
result, and stop.

If you find yourself on `main` with uncommitted work, ask before committing it
anywhere; do not "just this once" push to `main`.

## Commit messages

One line per commit. `type: what changed`, stated plainly, no body.

```
feat: add moveMapping and swapMacros to adg-codec
fix: permute variation values when moving a macro binding
docs: rename macrowizard framing to ableton-rackutils toolkit
chore: gitignore tmp/ scratch directory
```

Types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`. No scope suffix by
default (`feat:`, not `feat(codec):`). State the change, do not argue for it:
"permute variation values when moving a macro binding", not "permute variation
values, because otherwise moving a macro would silently corrupt every
variation in the rack". The reasoning goes in code comments or `doc/PLAN.md`,
not in the commit body.

Push commits thematically: one commit per feature or fix, not a mixed batch
squashed into one "misc changes" commit.

## PR summaries

Title: `<version> - <areas that changed>, plainly`. Example:
"0.2.0 - macro drag-to-move and variation permutation fix", not a metaphor.

Body: three headings, in this order, numbered within each heading, fixes
first.

```
## Fix 1 - <the symptom, in the reviewer's terms>
## Enhancement 1 - <what it now does>
## Cleanup
```

Heading names the effect, not the symbol: "moving a macro no longer corrupts
its rack's variations", not "fix permuteVariations bug". One to three sentences
under each: what it now does, plus mechanism only where needed to make the
change make sense. Then stop, the diff is attached.

Leave out: an opening paragraph restating what the release is for (the
headings say it), proof of work ("verified", "tested", "confirmed"), the
evidence trail that isolated a cause (that belongs in `doc/PLAN.md` or a
findings doc, not the PR), the story of getting there, a "known limits"
section (a limit goes in the entry it belongs to, in a clause), and emphasis
for its own sake.

## Scratch work

Anything exploratory (a spike, a one-off script, an unpacked `.adg` you are
reading once) goes under `tmp/`, gitignored, never the repo root. Delete a
spike once its answer is written down in `doc/PLAN.md` or `SCHEMA.md`. The
finding has value; the scaffolding that produced it does not.
