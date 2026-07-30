# Ordering the landing page by profitability

The card order on the landing page — the section groups, the modules inside them, and the
career paths — is **ranked by expected earnings for the learner**, not by our taste and not
alphabetically. This file holds the evidence, so the order can be argued with and
refreshed instead of drifting.

**Metric: pay × the chance of being hired for it.** Median salary alone ranks a language
nobody hires for above one that half the industry runs on; posting volume alone ranks the
cheapest work first. Both are needed.

**Researched: July 2026.** Figures are US-centric, which is the largest market and the
best-measured one — see [Caveats](#caveats).

## Evidence

### Roles — the destination, and what decides the group order

| Role | Median / average | Source |
|---|---|---|
| Cloud Infrastructure Engineer | **$189,000** | Stack Overflow 2025 (US) |
| Backend Developer | $175,000 | Stack Overflow 2025 (US) |
| Data Scientist / ML Specialist | $145,000 | Stack Overflow 2025 (US) |
| Frontend Developer | $145,000 | Stack Overflow 2025 (US) |
| Backend Developer | ~$161,000 avg | Indeed 2026 |
| DevOps Engineer | ~$133–145,000 avg | Indeed / Glassdoor 2026 |
| AI/ML Engineer | $142k median base · $185k avg · $244k+ total comp | Glassdoor / Built In / Levels.fyi 2026 |
| Data Analyst | ~$86,000–93,400 avg | Indeed / Glassdoor 2026 |
| Power BI Analyst | ~$73,000–109,000 | ZipRecruiter / Glassdoor 2026 |

The single most useful line here: **cloud infrastructure pays more than backend**, and
backend pays roughly **twice** what data analysis pays.

### Usage — professional developers, Stack Overflow 2025

| Technology | Usage | Note |
|---|---|---|
| Docker | **73.8%** | +17pt in one year — the largest single-year rise of any technology surveyed |
| JavaScript | 68.8% | |
| SQL | 61.3% | |
| PostgreSQL | 58.2% | most-used database |
| Python | 54.8% | +7pt year on year |
| Bash/Shell | 48.8% | |
| TypeScript | 48.8% | |
| AWS | 45.9% | |
| MySQL / SQLite | 39.6% / 36.9% | |
| Kubernetes | 30.1% | |
| C++ / C | 21.8% / 19.1% | added 2026-07-30 — C++ is ahead of C here and on pay |

In DevOps postings specifically: CI/CD 67%, automation 58%, Kubernetes 56%, AWS 54%,
Python 53% — i.e. the whole cluster sits on top of Linux.

### Languages — pay

| Language | Median / range | Note |
|---|---|---|
| Rust | ~$170,000 | not a module yet |
| Go | ~$155,000 (US $135–175k) | top-3 pay, and ~3–4× Rust's job volume |
| TypeScript | ~$129–155,000 | ~15% premium over JavaScript |
| Python | ~$125,000 | largest and fastest-growing surface |
| Ruby | ~$129,500 avg | strong pay, shrinking (Rails) market |
| JavaScript | ~$115–135,000 | most jobs, lowest pay of the top four |
| C++ | $142,385 avg (Indeed) · $112,200 median (ZipRecruiter) | finance, games, embedded; outranks C on both axes |
| C | $112,000 (Indeed) – $135,400 (Salary.com) | stable embedded/systems demand |
| PHP | $83,800 (Indeed) – $102,000 (ZipRecruiter) | large market, lowest pay |
| Lua | no comparable figure | niche: Roblox, Neovim, game modding |

### Frontend

React ~150,000 active listings vs Vue ~35,000 (3–5× on US/EU boards); React 42–48% market
share vs Vue 8.7–18.7%. Senior React $140–195k, senior Vue $120–170k.

| Skill | Rate | Source |
|---|---|---|
| Tailwind CSS (as the listed skill) | $34.07/hr avg (~$71k), $26.92–45.67 range | ZipRecruiter 2026 |
| Tailwind, entry level | $16.94/hr | ZipRecruiter 2026 |
| Next.js + Tailwind | $58.23/hr (~$121k) | ZipRecruiter 2026 |

That spread is the whole story for Tailwind: on its own it is markup work near the bottom
of the market; attached to a framework it nearly doubles. It is a **modifier, not a job**.

## The previous order — expected earnings (superseded 2026-07-30)

> This section describes the ordering the grid used until 2026-07-30: pay weighted by how
> many jobs actually exist. **It is no longer live.** It is kept in full because it is the
> best argument against what replaced it, and anyone revisiting the question should read
> both. The rule the code follows now is in **Pay-only ordering** below.

### Groups

1. **Languages** — the only group that is both the best-paid ($155–175k) and the largest
   hiring surface. Unambiguous.
2. **Tools** — Linux is the gateway to the highest-paid IC role measured ($189k), and the
   technology cluster above it is the most-used in the industry (Docker 73.8%).
3. **Web & Runtimes** — React's listing volume is enormous, but frontend's median ($145k)
   trails backend's ($175k).
4. **Databases** — SQL and PostgreSQL are on ~60% of professional stacks, but as a
   *primary* skill they pay analyst money ($86–120k). Near-universal **secondary** skill.
5. **Graphics & AI** — the highest ceiling per role and the thinnest market. See the
   honest caveat below.

The dividing line: groups 1–3 are things you are hired **as**; group 4 is what you are
hired **with**; group 5 has the best pay and the fewest doors.

### Within the groups

- **Languages**: Go · TypeScript · Python · JavaScript · C++ · C · Ruby · PHP · Lua
  C over Ruby was the closest call on the page — Ruby's average pay is higher, but C's
  demand is stable where Rails is shrinking.
- **Tools**: Linux · Git — Linux carries this group; Git is table stakes, on every job ad
  and never the reason anyone is hired.
- **Web & Runtimes**: React · Vue · CSS · Tailwind CSS · WebAssembly
  The two frameworks lead because they are job titles. CSS sits above Tailwind despite
  being the less fashionable line on a CV: it is a hard prerequisite for both frameworks
  and appears in effectively every frontend ad, where Tailwind's own measured rate
  ($34/hr standalone) is the lowest figure in this group. Tailwind earns its place
  because *paired* with a framework it nearly doubles ($58/hr) — but you cannot pair
  what you do not have.
- **Databases**: PostgreSQL · DuckDB · SQLite — SQLite has far higher usage (36.9%) than
  DuckDB, but it is deployment count, not hiring signal; DuckDB shows up in modern data
  stack postings, SQLite essentially never does.
- **Graphics & AI**: AI/ML · Three.js

## Pay-only ordering (live, 2026-07-30)

The owner's call: rank strictly by **how much money each technology makes**, dropping the
hiring-volume term entirely. Groups are ranked by the **median** of their modules' figures.

### The figures

US average annual salary for the technology **as a job-posting keyword**. Indeed where a
career page exists (posting-derived, sample size shown); ZipRecruiter for the niches Indeed
does not track. Confidence is about the *number*, not the technology.

| Module | US avg / yr | Source | Confidence |
|---|---:|---|---|
| AI / ML | **$190,810** | Indeed, "machine learning engineer" (5.2k) | high |
| C++ | **$142,385** | Indeed (662) | high |
| Linux | **$139,290** | Indeed, "Linux engineer" (653) | high |
| Vue | $138,932 | ZipRecruiter | medium |
| Go | $130,219 | Indeed, "Golang developer" (133) | medium |
| TypeScript | $129,348 | ZipRecruiter | **low** |
| React | $129,348 | ZipRecruiter | **low** |
| Lua | $127,901 | ZipRecruiter | **low** |
| Python | $127,875 | Indeed (1.7k) | high |
| PostgreSQL | $123,262 | ZipRecruiter, "PostgreSQL developer" | medium |
| Three.js | $121,124 | ZipRecruiter | low |
| Ruby | $119,243 | Indeed (44) | **low** |
| C | $112,000 | Indeed | medium |
| CSS | $111,845 | ZipRecruiter | medium |
| JavaScript | $111,629 | Indeed (146) | medium |
| DuckDB · SQLite | $110,489 | proxy: ZipRecruiter "database developer" | none |
| PHP | $83,800 | Indeed | medium |
| Tailwind CSS | $70,866 | ZipRecruiter ($34.07/hr) | medium |
| WebAssembly | ~$54,800 | ZipRecruiter ($26.34/hr) | **unusable** |
| Git | — | no keyword salary exists | none |

### The order this produces

| # | Group | Median | Modules, highest paid first |
|---|---|---:|---|
| 1 | Graphics & AI | $155,967 | AI/ML · Three.js |
| 2 | Tools | $139,290 | Linux · Git |
| 3 | Languages | $127,875 | C++ · Go · TypeScript · Lua · Python · Ruby · C · JavaScript · PHP |
| 4 | Web & Runtimes | $111,845 | Vue · React · CSS · Tailwind · WebAssembly |
| 5 | Databases | $110,489 | PostgreSQL · DuckDB · SQLite |

### What the reader should not conclude

Four results are artefacts of the data, not findings about the work:

- **Lua ($127,901) above Python ($127,875).** A $26 gap between a 1.7k-sample Indeed figure
  and a thin, Roblox-skewed ZipRecruiter keyword page. Treat the two as tied at best.
- **WebAssembly last (~$54,800).** The keyword page matches jobs that are not engineering
  roles. This is a broken number; WebAssembly is not a $55k skill.
- **Git, SQLite and DuckDB have no figure at all.** Nobody is hired as a "SQLite developer",
  which is a fact about job *titles*, not about how valuable the skill is. They sort last in
  their groups on a proxy, and that placement carries no signal.
- **Databases last overall.** Driven by two proxied entries, not by evidence that data work
  pays badly — the one real figure in the group (Postgres, $123k) would place it mid-table.

And the structural objection, recorded once: pay-only ordering says nothing about whether a
learner can *get* one of these jobs. AI/ML now leads the grid on a $190k median while our
module teaches in-browser inference rather than the PyTorch work those postings hire for,
and JavaScript — on 68.8% of professional stacks — sits eighth of nine in Languages. If the
grid is meant to answer "what should I learn to get hired", volume belongs in the formula;
if it is meant to answer "what pays most", this is correct as written.

### Career paths — unchanged by this

The three path cards above the module grid were **not** reordered. They are ranked by the
pay of the *role* they lead to, which was already a pay-only ranking, so the new rule
leaves them exactly as they were:

**Backend** ($175k) → **DevOps** ($133–189k depending on title) → **Data Analyst**
($86–93k). Backend leads despite cloud infrastructure's higher ceiling because DevOps is
rarely a *first* job — it is normally reached through development experience, which is
why our own DevOps path teaches Go and HTTP servers before it teaches Kubernetes.

## Caveats

Three things this ordering does not know, and one place it is deliberately conservative:

- **The AI/ML card is not the AI/ML job.** The $185k figure is for engineers building on
  the Python/PyTorch stack. Our module teaches in-browser inference with transformers.js,
  which is a genuinely useful skill and *not* the one those postings hire for. That gap,
  not the pay, is why the group sits last.
- **US-weighted.** A Portugal- or EU-weighted ranking would likely push Go down and
  PHP/JavaScript up, since that market skews toward agency and product web work.
- **The market shrank.** US software developer postings on Indeed are down ~33% from 2020
  and ~35% from the early-2024 peak, with entry level hit hardest. AI postings moved the
  other way: 4.2% of all jobs, up 134% since 2020. Rankings here are relative positions in
  a smaller pool.
- **Averages hide seniority.** Every figure above mixes levels. None of them is what a
  first job pays.

## Sources

- [Stack Overflow Developer Survey 2025 — Technology](https://survey.stackoverflow.co/2025/technology/)
- [Stack Overflow Developer Survey 2025 — Work](https://survey.stackoverflow.co/2025/work/)
- [Stack Overflow 2025 salary data by role (US)](https://techrecruiting.io/en/stack-overflow-developer-survey-2025-usa/)
- [Indeed — backend developer salaries](https://www.indeed.com/career/back-end-developer/salaries)
- [Indeed — DevOps engineer salaries](https://www.indeed.com/career/devops-engineer/salaries)
- [Indeed — data analyst salaries](https://www.indeed.com/career/data-analyst/salaries)
- [Indeed — PHP developer salaries](https://www.indeed.com/career/php-developer/salaries)
- [Indeed — C developer salaries](https://www.indeed.com/career/c-developer/salaries)
- [Indeed — C++ developer salaries](https://www.indeed.com/career/c++-developer/salaries)
- [ZipRecruiter — C/C++ developer pay](https://www.ziprecruiter.com/Salaries/C-C-Developer-Salary)

Added for the pay-only ordering (2026-07-30):

- [Indeed — Python developer salaries](https://www.indeed.com/career/python-developer/salaries)
- [Indeed — JavaScript developer salaries](https://www.indeed.com/career/javascript-developer/salaries)
- [Indeed — Golang developer salaries](https://www.indeed.com/career/golang-developer/salaries)
- [Indeed — Ruby developer salaries](https://www.indeed.com/career/ruby-developer/salaries)
- [Indeed — Linux engineer salaries](https://www.indeed.com/career/linux-engineer/salaries)
- [Indeed — machine learning engineer salaries](https://www.indeed.com/career/machine-learning-engineer/salaries)
- [ZipRecruiter — TypeScript developer](https://www.ziprecruiter.com/Salaries/Typescript-Developer-Salary)
- [ZipRecruiter — React developer](https://www.ziprecruiter.com/Salaries/React-Developer-Salary)
- [ZipRecruiter — Vue.js developer](https://www.ziprecruiter.com/Salaries/Vuejs-Developer-Salary)
- [ZipRecruiter — CSS developer](https://www.ziprecruiter.com/Salaries/Css-Developer-Salary)
- [ZipRecruiter — PostgreSQL developer](https://www.ziprecruiter.com/Salaries/Postgresql-Developer-Salary)
- [ZipRecruiter — database developer (SQLite/DuckDB proxy)](https://www.ziprecruiter.com/Salaries/Database-Developer-Salary)
- [ZipRecruiter — Lua developer](https://www.ziprecruiter.com/Salaries/Lua-Developer-Salary)
- [ZipRecruiter — Three.js developer](https://www.ziprecruiter.com/Salaries/Three-Js-Developer-Salary)

Note: Stack Overflow's 2025 survey has **no** pay-by-technology table (only pay by developer
role), so it could not be used as a single comparable spine. That is why the table above
mixes two providers, and why the confidence column exists.
- [Glassdoor — Ruby developer](https://www.glassdoor.com/Salaries/ruby-developer-salary-SRCH_KO0,14.htm)
- [Glassdoor — AI/ML engineer](https://www.glassdoor.com/Salaries/ai-ml-engineer-salary-SRCH_KO0,14.htm)
- [KORE1 — Kubernetes engineer salary guide 2026](https://www.kore1.com/kubernetes-engineer-salary-guide/)
- [InterviewStack — DevOps skills in postings, 2026](https://interviewstack.io/blog/devops-engineer-skills-companies-want-2026)
- [tech-insider — TypeScript vs JavaScript 2026](https://tech-insider.org/typescript-vs-javascript-2026/)
- [tech-insider — React vs Vue 2026](https://tech-insider.org/react-vs-vue-2026/)
- [ZipRecruiter — Tailwind CSS pay](https://www.ziprecruiter.com/Jobs/Tailwind-Css)
- [ZipRecruiter — Next.js + Tailwind pay](https://www.ziprecruiter.com/Jobs/Next-Js-Tailwind)
- [Visual Capitalist — the decline of US software developer jobs](https://www.visualcapitalist.com/charted-the-decline-of-u-s-software-developer-jobs/)
- [Indeed Hiring Lab — 2026 US jobs & hiring trends](https://www.hiringlab.org/2025/11/20/indeed-2026-us-jobs-hiring-trends-report/)
