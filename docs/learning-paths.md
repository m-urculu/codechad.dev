# Career Paths — fixed curricula that span runtimes

Every other course in the app is **invented for the learner**: they pick a technology on
the landing grid, answer two questions, and a grounded model designs the topic list. A
career path is the opposite and deliberately so — the curriculum is **fixed, written in
`src/lib/paths.ts`, and identical for everyone who starts it**.

The reason is that the generator asks the learner to judge a syllabus, and someone whose
goal is "become a backend developer" is precisely the person who cannot. A path answers
that question once, in code, in an order that has been thought about.

Three paths ship: **Backend Developer** (23 courses), **DevOps Engineer** (18) and
**Data Analyst** (16).

## Shape

A path is an ordered list of courses, each an ordered list of chapters. That maps onto
the roadmap tree the rest of the app already renders, expands and stores:

| Path data | Roadmap node | Ids | Generated? |
|---|---|---|---|
| path | `Roadmap` | — | no — built locally |
| course | `topic` | `t0`, `t1`, … | no |
| chapter | `subtopic` | `t0-s0`, `t0-s1`, … | no |
| — | `point` (a lesson) | `t0-s0-p0`, … | **yes, on demand** |

So the model is still what writes the lessons; it is just no longer what decides the
curriculum. **Opening a path costs no generation call** — the whole tree appears at once,
and only the leaves are generated, when the learner reaches them.

Ids follow the generator's own scheme because everything downstream keys on them: stored
progress, the lesson cache, and expansion.

## Runtimes

Each course names the runtime it is practiced in (a `RUNTIMES` id), and a chapter may
override it. This is what per-lesson runtimes exist for: the editor follows the lesson
across Python → Go → SQL → the shell while the roadmap and the conversation stay with the
one course.

Where a technology cannot run in a browser at all, the module is one of the
**non-runnable specs** (`engine: "none"`, `runnable: false`) added for the paths:

| Module | The learner writes | Why it can't run |
|---|---|---|
| `docker` | Dockerfiles, docker commands | a container needs a Linux kernel and a daemon |
| `kubernetes` | manifests, kubectl commands | a cluster is a control plane plus nodes |
| `aws` | CLI invocations, IAM/policy JSON | needs a real account, credentials and money |
| `cicd` | GitHub Actions workflows | a workflow needs a runner and repository events |
| `rabbitmq` | Go client code (amqp091-go) | pub/sub needs a broker and a TCP connection |
| `powerbi` | DAX measures, Power Query steps | Power BI Desktop is a Windows application |
| `pygame` | Python against the Pygame API | Pyodide has no Pygame display surface |
| `career` | resume, README, project scope, answers | it is writing, not code |

`runnable: false` was already a supported shape — `CodeHere` disables Run and offers
Submit, and `lesson.ts` writes a different prompt for it — so these teach by having the
learner produce the **real artifact**, which the tutor reviews against the real tool's
semantics. Each spec's `runNotes` says plainly that nothing executes, so the generator
never writes an objective that depends on output the learner cannot produce.

These modules are **not on the landing grid**. A path is the only thing that puts one on
a node.

## Identity

A path course is stored with `skill` = the path title ("Backend Developer") and `module` =
the runtime it opens in (`python` for all three, since all three open with Python).

- `skill` is what the lesson and agent prompts are framed around. A Go lesson inside a
  backend path must not be told its subject is Python.
- It is also how a **resumed** path is recognised — `getPathByTitle(course.skill)` — since
  the stored row holds no path id. That is what the landing card's path colour and the
  settings screen's runtime list both key on.
- `module` keeps persistence, the docs pane and the fallback runtime working unchanged.

## Cold start

A generated course asks two questions (level, then goal) and then generates. A path asks
**one**: its curriculum is fixed and its goal is the job it is named after, so only the
level is still worth having — it is what every lesson on the path is pitched at.
Answering it opens the Roadmap tab.

## Regenerating one

Course settings can rebuild any curriculum from an edited topic list. For a path course
the request carries `modules: pathModules(path)`, which is what makes
`generateOverview` tag each topic with the runtime it is genuinely practiced in. Without
it the model returns untagged topics, every lesson falls back to the module the path
opened in, and a Go chapter hands the learner a Python editor.

## Editing the data

`src/lib/paths.ts` holds shared course constants composed into the three paths — all
three open with the same courses, and a learner who switches paths should recognise the
ground they already covered rather than meet a reworded copy of it.

Two things in that file are **ours, not upstream**: the portfolio projects' chapters
(upstream they are a brief, not a syllabus) and the per-chapter runtime overrides.
