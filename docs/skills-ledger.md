# The skills ledger

What the learner already knows, tracked as a fact about the **learner** rather than a
fact about one course, so a second course never re-teaches what the first one taught.

## The problem

Every course was generated as if it were the learner's first. The only prior-knowledge
signals were:

- the **stated level** ("New to it" / "Some experience" / "Experienced"), which is a
  self-assessment made once, before any work exists; and
- `siblingCourses()`, the **topic titles** of the learner's other courses for the same
  technology — regardless of whether a single lesson in them was ever opened.

Neither is evidence. A topic list from a course abandoned on day one was treated
exactly like one the learner finished. So finishing an introduction to Python in one
course and starting another Python course a week later got you variables again.

## What it records

Completion, and only completion. `deriveSkills()` (`src/lib/skills.ts`) walks a course's
tree against its progress and emits an entry for each finished node **at the coarsest
level that is fully done**:

| the learner finished | the ledger stores |
|---|---|
| every lesson in a topic | one `topic` entry |
| every lesson in one sub-topic of an unfinished topic | one `subtopic` entry |
| a single lesson | one `point` entry |
| nothing, or an unexpanded branch | nothing |

Collapsing at the coarsest level is what keeps the ledger prompt-sized: six finished
topics are six lines, not six hundred. An unexpanded branch contributes nothing — the
snowflake tree is lazy, so "no children" means "never explored", not "nothing to learn".

Titles are normalized by `skillKey()` — lowercased, punctuation and noise words dropped,
remaining words sorted — so `Introduction to Functions` and `Functions` are one key and
word order stops mattering. This exists to collapse exact repeats, not to claim semantic
equality; the consumer is a language model, and it merges synonyms better than a slug
comparison ever will.

## How generation uses it

`knownSkillsBlock()` renders the ledger into a prompt block, and all three generators
take it: `generateOverview` (L1 topics), `expandNode` (L2/L3), `buildLesson` (L4). The
block has two headings, and the distinction between them is the whole design:

**Same technology** — a strong signal. Treat it as taught and passed. Do not build a
topic, sub-topic or lesson whose subject is any of it; use it freely instead.

**Other technologies** — a deliberately weaker one. Finishing "Functions and Scope" in
Python says the learner knows what a function *is*. It says nothing about Go's multiple
returns or named result parameters. So the prompt asks the model to assume the *concept*
and still teach *this* language's syntax, semantics, idiom and pitfalls. Cross-technology
entries are also restricted to whole finished topics and sub-topics — one completed
lesson in another language is not a fact worth bending a curriculum around.

Getting this backwards — silently skipping Go's function semantics because the learner
once wrote a Python function — is a far worse failure than a little redundancy, and the
asymmetry in the prompt is there on purpose.

## Where the writes happen

`POST /api/roadmap/state` is the single funnel every progress change already flows
through, so `syncCourseSkills()` hangs off it and nothing in the client has to remember
to report a completion. The sync is diff-based and idempotent: rows the course no longer
justifies are deleted, the rest upserted.

That falls out correctly for the destructive actions too — `reset` and `recalibrate`
call `resyncCourseSkills()`, the derived set becomes empty, and the ledger forgets a
course that is about to be retaken. Otherwise the lessons it is about to re-teach would
be the exact ones the generators had been told to skip.

## Deliberate limits

- **It is a cache, not a source of truth.** `user_roadmap_state` remains authoritative;
  dropping `user_skill` entirely costs nothing but a re-sync. It exists because
  answering "what does this person know" from the trees would mean pulling every large
  `jsonb` blob the user owns on every generation call — three per lesson.
- **Deleting a course deletes the knowledge it evidenced** (`course_id` cascades). The
  alternative is orphan rows that outlive their course, silently shaping every future
  course with nothing in the app that can show the learner why or let them undo it.
- **The learner can see it**: `GET /api/skills`. A system that decides what you are not
  taught, and cannot be inspected, is one you have no way to question when it is wrong.
- **It does not touch the level.** The stated level still decides depth and pacing
  (`src/lib/agents/level.ts`); the ledger decides *coverage*. Someone who finished the
  Python basics but calls themselves "New to it" still gets beginner-paced lessons — on
  material they have not already done.
