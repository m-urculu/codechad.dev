// Career paths — pre-authored, multi-technology curricula.
//
// Every other course in the app is INVENTED for the learner: they pick a technology,
// answer two questions, and a grounded model designs the topic list. A path is the
// opposite and deliberately so — the curriculum is FIXED, written here, and identical
// for everyone who starts it. Someone who wants "make me a backend developer" is not
// in a position to judge a syllabus, which is the one thing the generator asks of
// them; a path answers that question once, in code, in an order that has been thought
// about.
//
// Shape: a path is an ordered list of COURSES, each an ordered list of CHAPTERS. That
// maps exactly onto the roadmap tree the rest of the app already renders and expands:
//
//     path      -> Roadmap
//     course    -> topic      (t0, t1, …)          module named here
//     chapter   -> subtopic   (t0-s0, t0-s1, …)    inherits, or overrides, the module
//     (lesson)  -> point      (t0-s0-p0, …)        generated on demand, as always
//
// So the LLM is still what writes the lessons — it is just no longer what decides the
// curriculum. Nothing here costs a generation call: opening a path builds the whole
// tree locally and instantly, and only the leaves are generated, when reached.
//
// Each course names the runtime it is practiced in (a RUNTIMES id), which is what
// per-lesson runtimes exist for: the editor follows the lesson across Python -> Go ->
// SQL -> the shell while the roadmap and the conversation stay with the one course.
// Where a technology cannot run in a browser at all (Docker, Kubernetes, AWS, CI/CD,
// RabbitMQ, Power BI, Pygame) the module is one of the non-runnable specs in the
// registry: the learner writes the real artifact and submits it for review, and the
// runtime notes say plainly that nothing executes so no lesson promises otherwise.

import type { Roadmap, RoadmapNode } from "@/lib/agents/snowflake";

/** A chapter, or a chapter that is practiced in a different runtime than its course. */
export type PathChapter = string | { title: string; module: string };

export type PathCourseKind = "course" | "project" | "portfolio";

export type PathCourse = {
  title: string;
  /** What the learner walks away able to do — shown under the topic in the roadmap. */
  summary: string;
  kind: PathCourseKind;
  /** RUNTIMES id every chapter inherits. */
  module: string;
  chapters: PathChapter[];
};

export type LearningPath = {
  id: string;
  /** The course's name in the learner's list, and the `skill` its prompts are built around. */
  title: string;
  /** One line on the landing card. */
  blurb: string;
  summary: string;
  /** Stored as the course goal, so every lesson knows what it is ultimately for. */
  goal: string;
  /** The workspace's own module — the runtime a node falls back to, and the first one taught. */
  module: string;
  /** Brand colour for the path card. */
  color: string;
  courses: PathCourse[];
};

// ---- Courses ------------------------------------------------------------------
//
// Defined once and shared: all three paths open with the same eight-ish courses, and
// a learner who switches paths should recognise the ground they already covered
// rather than meet a reworded copy of it.

const PYTHON_BASICS: PathCourse = {
  title: "Learn to Code in Python",
  summary: "The language from zero: values, control flow, the built-in collections, and errors.",
  kind: "course",
  module: "python",
  chapters: [
    "Introduction", "Variables", "Functions", "Scope", "Testing and Debugging",
    "Computing", "Comparisons", "Loops", "Lists", "Dictionaries", "Sets",
    "Errors", "Type Hints", "Practice", "Quiz",
  ],
};

const LINUX: PathCourse = {
  title: "Learn Linux",
  summary: "The command line as a working tool: files, pipes, permissions and processes.",
  kind: "course",
  module: "linux",
  chapters: [
    "The Command Line", "Filesystems", "Programs", "Input/Output", "Local CLI",
    "Permissions", "Editors and Packages",
  ],
};

const BOOKBOT: PathCourse = {
  title: "Build a BookBot",
  summary: "First program worth keeping — read a book from disk and report on it.",
  kind: "project",
  module: "python",
  chapters: ["Setup", "Data Analysis", "Report"],
};

const GIT: PathCourse = {
  title: "Learn Git",
  summary: "Version control for real: commits, branches, merges, rebases and remotes.",
  kind: "course",
  module: "git",
  chapters: [
    "Setup", "Repositories", "Internals", "Config", "Branching", "Merge",
    "Rebase", "Reset", "Remote", "GitHub", "Gitignore",
  ],
};

const OOP: PathCourse = {
  title: "Learn Object Oriented Programming",
  summary: "Classes as a design tool — and when the four pillars help rather than hurt.",
  kind: "course",
  module: "python",
  chapters: [
    "Clean Code", "Classes", "Encapsulation", "Abstraction", "Inheritance", "Polymorphism",
  ],
};

// Pygame has no browser surface, so the game itself is written and reviewed rather
// than run — except the maths, which is ordinary Python and worth actually executing.
const ASTEROIDS: PathCourse = {
  title: "Build Asteroids",
  summary: "A real game loop: sprites, per-frame updates, vectors and collisions.",
  kind: "project",
  module: "pygame",
  chapters: [
    "Pygame",
    "Gameloop",
    { title: "Player", module: "python" },
    "Asteroids",
  ],
};

const FUNCTIONAL: PathCourse = {
  title: "Learn Functional Programming",
  summary: "Functions as values: purity, recursion, closures, currying and decorators.",
  kind: "course",
  module: "python",
  chapters: [
    "What is Functional Programming?", "First-Class Functions", "Pure Functions",
    "Recursion", "Function Transformations", "Closures", "Currying", "Decorators",
    "Sum Types",
  ],
};

const AI_AGENT: PathCourse = {
  title: "Build an AI Agent",
  summary: "The loop behind every agent — tool schemas, dispatch, and deciding when to stop.",
  kind: "project",
  module: "python",
  chapters: ["LLMs", "Functions", "Function Calling", "Agents"],
};

const DSA: PathCourse = {
  title: "Learn Data Structures and Algorithms",
  summary: "What costs what, and the structures that make the difference — through to graphs.",
  kind: "course",
  module: "python",
  chapters: [
    "Algorithms Intro", "Math", "Big-O Analysis", "Sorting Algorithms", "Exponential Time",
    "Data Structures Intro", "Stacks", "Queues", "Linked Lists", "Binary Trees",
    "Red Black Trees", "Hashmaps", "Tries", "Graphs", "BFS and DFS", "P vs NP",
  ],
};

const STATIC_SITE_GENERATOR: PathCourse = {
  title: "Build a Static Site Generator",
  summary: "Markdown in, a website out — parsing, a node tree, and rendering HTML.",
  kind: "project",
  module: "python",
  chapters: ["Static Sites", "Nodes", "Inline", "Blocks", "Website"],
};

const MEMORY_MANAGEMENT: PathCourse = {
  title: "Learn Memory Management",
  summary: "What a pointer really is, where memory lives, and how a garbage collector works.",
  kind: "course",
  module: "c",
  chapters: [
    "C Basics", "Structs", "Pointers", "Enums", "Unions", "Stack and Heap",
    "Advanced Pointers", "Stack Data Structure", "Objects", "Refcounting GC",
    "Mark and Sweep GC",
  ],
};

const GO: PathCourse = {
  title: "Learn Go",
  summary: "A second language, and the one the backend is built in — types, interfaces, concurrency.",
  kind: "course",
  module: "go",
  chapters: [
    "Variables", "Constants and Formatting", "Conditionals", "Functions", "Structs",
    "Interfaces", "Errors", "Loops", "Slices", "Maps", "Pointers",
    "Packages and Modules", "Channels", "Mutexes", "Generics", "Enums", "Quiz",
  ],
};

const HTTP_CLIENTS_GO: PathCourse = {
  title: "Learn HTTP Clients",
  summary: "How the web actually talks: DNS, URIs, methods, headers, status codes and TLS.",
  kind: "course",
  module: "go",
  chapters: [
    "Why HTTP?", "JSON", "DNS", "URIs", "Headers", "Methods", "Paths", "HTTPS",
    "Errors", "cURL",
  ],
};

const POKEDEX: PathCourse = {
  title: "Build a Pokedex",
  summary: "A CLI that talks to an API — a REPL, paginated fetching, and a cache with expiry.",
  kind: "project",
  module: "go",
  chapters: ["REPL", "Cache", "Pokedex"],
};

const SQL: PathCourse = {
  title: "Learn SQL",
  summary: "Designing tables and asking them questions — constraints, joins, aggregates, indexes.",
  kind: "course",
  module: "postgres",
  chapters: [
    "Introduction", "Tables", "Constraints", "CRUD", "Basic Queries", "Structuring",
    "Aggregations", "Subqueries", "Normalization", "Joins", "Performance",
  ],
};

const BLOG_AGGREGATOR: PathCourse = {
  title: "Build a Blog Aggregator",
  summary: "A long-running service: config, a real schema, RSS polling and follows.",
  kind: "project",
  module: "go",
  chapters: [
    "Config",
    { title: "Database", module: "postgres" },
    "RSS", "Following", "Aggregate",
  ],
};

const HTTP_SERVERS: PathCourse = {
  title: "Learn HTTP Servers",
  summary: "The other side of the request: routing, storage, auth, webhooks and docs.",
  kind: "course",
  module: "go",
  chapters: [
    "Servers", "Routing", "Architecture", "JSON", "Storage", "Authentication",
    "Authorization", "Webhooks", "Documentation",
  ],
};

const FILE_SERVERS: PathCourse = {
  title: "Learn File Servers and CDNs",
  summary: "Serving bytes at scale — object storage, caching, streaming and edge delivery.",
  kind: "course",
  module: "aws",
  chapters: [
    "File Storage", "Caching", "AWS S3", "Object Storage", "Video Streaming",
    "Security", "CDNs", "Resiliency",
  ],
};

const DOCKER: PathCourse = {
  title: "Learn Docker",
  summary: "Containers as the unit of deployment: images, layers, volumes, networks, registries.",
  kind: "course",
  module: "docker",
  chapters: [
    "Install", "Containers", "Storage", "Execute", "Networks", "Dockerfiles",
    "Debug", "Publish",
  ],
};

const PUBSUB: PathCourse = {
  title: "Learn Pub/Sub Architecture",
  summary: "Decoupling services with a broker — exchanges, routing, delivery guarantees.",
  kind: "course",
  module: "rabbitmq",
  chapters: [
    "Pub/Sub Architecture", "Message Brokers", "Publishers & Queues",
    "Subscribers & Routing", "Delivery", "Serialization", "Scalability",
  ],
};

const LOGGING: PathCourse = {
  title: "Learn Logging and Observability",
  summary: "Running something you can debug at 3am — structured logs, metrics, traces, alerts.",
  kind: "course",
  module: "go",
  chapters: [
    "Observability", "Logging", "Structured Logging", "Log Strategies", "Logging Errors",
    "Logging Context", "Log Storage", "Log Security", "Metrics", "Alerting",
    "Profiling", "Tracing",
  ],
};

const AWS: PathCourse = {
  title: "Learn AWS",
  summary: "The cloud primitives everything else sits on — network, compute, storage, identity.",
  kind: "course",
  module: "aws",
  chapters: [
    "Cloud Computing", "Networking - VPCs", "EC2 - Elastic Compute Cloud",
    "RDS - Relational Database Service", "IAM - Identity and Access Management",
    "Monitoring - CloudWatch", "DNS – Route 53", "S3 - Simple Storage Service",
    "CDN – CloudFront", "ECS - Elastic Container Service", "Serverless Functions – Lambda",
  ],
};

const CICD: PathCourse = {
  title: "Learn CI/CD",
  summary: "A pipeline that gates every change: tests, linting, security, build, deploy.",
  kind: "course",
  module: "cicd",
  chapters: [
    "Continuous Integration", "Tests", "Formatting", "Linting", "Security", "Build",
    "Deploy", "Database",
  ],
};

const KUBERNETES: PathCourse = {
  title: "Learn Kubernetes",
  summary: "Declaring what should be running and letting the cluster keep it that way.",
  kind: "course",
  module: "kubernetes",
  chapters: [
    "Install", "Pods", "Deployments", "ConfigMaps", "Services", "Gateway", "Storage",
    "Namespaces", "Scaling", "Nodes",
  ],
};

const HTTP_CLIENTS_PY: PathCourse = {
  title: "Learn HTTP Clients",
  summary: "Talking to APIs from Python — requests, JSON, async, and the protocol underneath.",
  kind: "course",
  module: "python",
  chapters: [
    "Why HTTP?", "DNS", "URIs", "Async", "Headers", "JSON", "Methods", "Paths", "HTTPS",
  ],
};

const WEB_SCRAPER: PathCourse = {
  title: "Build a Web Scraper",
  summary: "Getting data nobody handed you — crawling, concurrency and a report at the end.",
  kind: "project",
  module: "python",
  chapters: ["Setup", "Crawling", "Concurrency", "Reporting"],
};

const PANDAS: PathCourse = {
  title: "Learn Pandas",
  summary: "The analyst's daily tool — loading, cleaning, filtering, merging and aggregating.",
  kind: "course",
  module: "python",
  chapters: [
    "Data Manipulation", "Data Formats", "Pandas", "Filtering and Sorting",
    "Data Cleaning", "Merging", "Aggregation and Modeling", "Events and Cohorts", "Polars",
  ],
};

const POWER_BI: PathCourse = {
  title: "Learn Power BI",
  summary: "Turning a model into something a stakeholder reads — DAX, charts and dashboards.",
  kind: "course",
  module: "powerbi",
  chapters: [
    "Data Sources", "Basic Charts", "Color", "Data Preparation", "Data Modeling", "DAX",
    "More Charts", "Dashboards", "Collaboration",
  ],
};

const RAG: PathCourse = {
  title: "Learn Retrieval Augmented Generation",
  summary: "Search that feeds a model — TF-IDF, embeddings, chunking, reranking and evaluation.",
  kind: "course",
  module: "python",
  chapters: [
    "Preprocessing", "TF-IDF", "Keyword Search", "Semantic Search", "Chunking",
    "Hybrid Search", "LLMs", "Reranking", "Evaluation", "Augmented Generation",
    "Agentic", "Multimodal",
  ],
};

// The two portfolio projects carry no chapter list upstream — they are a brief, not a
// syllabus. These four chapters are ours, and they are the part learners skip: scoping
// something finishable, and writing it up so it reads as work rather than homework.
const PERSONAL_PROJECT: PathCourse = {
  title: "Personal Project",
  summary: "Your own idea, start to finish — the first thing on the résumé that nobody assigned.",
  kind: "portfolio",
  module: "career",
  chapters: ["Pick and scope it", "Plan the build", "Write it up", "Ship it"],
};

const CAPSTONE: PathCourse = {
  title: "Capstone Project",
  summary: "The project the interview is about: bigger, yours, and finished.",
  kind: "portfolio",
  module: "career",
  chapters: ["Pick and scope it", "Design it", "Build it", "Write it up", "Present it"],
};

const FIND_A_JOB: PathCourse = {
  title: "Learn How to Find a Programming Job",
  summary: "The search itself as a skill — portfolio, résumé, applications, networking, interviews.",
  kind: "course",
  module: "career",
  chapters: [
    "Strategy", "Projects", "GitHub Profile", "Resume", "LinkedIn Profile", "Applying",
    "Networking", "Interviewing", "Relocation",
  ],
};

// ---- The paths ----------------------------------------------------------------

export const PATHS: LearningPath[] = [
  {
    id: "backend",
    title: "Backend Developer",
    blurb: "Python → Go → SQL → HTTP → Docker",
    summary:
      "From the first line of Python to a deployed Go service: the language, the tools around it, " +
      "the data structures interviews ask about, memory, a second language, databases, HTTP on both " +
      "sides, containers and messaging — with projects throughout.",
    goal: "Become a hireable backend developer",
    module: "python",
    color: "#00ADD8",
    courses: [
      PYTHON_BASICS, LINUX, BOOKBOT, GIT, OOP, ASTEROIDS, FUNCTIONAL, AI_AGENT, DSA,
      STATIC_SITE_GENERATOR, MEMORY_MANAGEMENT, PERSONAL_PROJECT, GO, HTTP_CLIENTS_GO,
      POKEDEX, SQL, BLOG_AGGREGATOR, HTTP_SERVERS, FILE_SERVERS, DOCKER, PUBSUB,
      CAPSTONE, FIND_A_JOB,
    ],
  },
  {
    id: "devops",
    title: "DevOps Engineer",
    blurb: "Linux → Go → Docker → AWS → Kubernetes",
    summary:
      "The developer half first — you cannot operate software you could not have written — then the " +
      "operations half: containers, observability, the cloud, pipelines that gate every change, and " +
      "orchestration.",
    goal: "Become a hireable DevOps engineer",
    module: "python",
    color: "#2496ED",
    courses: [
      PYTHON_BASICS, LINUX, BOOKBOT, GIT, OOP, ASTEROIDS, PERSONAL_PROJECT, GO,
      HTTP_CLIENTS_GO, SQL, HTTP_SERVERS, DOCKER, LOGGING, AWS, CICD, KUBERNETES,
      CAPSTONE, FIND_A_JOB,
    ],
  },
  {
    id: "data-analyst",
    title: "Data Analyst",
    blurb: "Python → SQL → pandas → Power BI → RAG",
    summary:
      "Python and SQL as the two languages the job is actually done in, then getting hold of data " +
      "(APIs, scraping), shaping it with pandas, reporting it in Power BI, and building retrieval " +
      "over it.",
    goal: "Become a hireable data analyst",
    module: "python",
    color: "#3776AB",
    courses: [
      PYTHON_BASICS, LINUX, BOOKBOT, GIT, SQL, OOP, ASTEROIDS, FUNCTIONAL, AI_AGENT,
      HTTP_CLIENTS_PY, WEB_SCRAPER, PANDAS, POWER_BI, RAG, CAPSTONE, FIND_A_JOB,
    ],
  },
];

/** Every distinct runtime a path is taught in, in the order it is first reached. */
export function pathModules(path: LearningPath): string[] {
  const seen: string[] = [];
  for (const course of path.courses) {
    for (const m of [course.module, ...course.chapters.map((c) => chapterModule(c, course.module))]) {
      if (!seen.includes(m)) seen.push(m);
    }
  }
  return seen;
}

export function getPath(id?: string | null): LearningPath | null {
  return id ? PATHS.find((p) => p.id === id) ?? null : null;
}

/** A path course by its title, so a stored path course can be recognised on resume. */
export function getPathByTitle(title?: string | null): LearningPath | null {
  return title ? PATHS.find((p) => p.title === title) ?? null : null;
}

// ---- Building the roadmap -----------------------------------------------------

function chapterTitle(c: PathChapter): string {
  return typeof c === "string" ? c : c.title;
}

function chapterModule(c: PathChapter, fallback: string): string {
  return typeof c === "string" ? fallback : c.module;
}

/**
 * The whole path as a roadmap tree, built locally — no generation call.
 *
 * Ids follow the same scheme the generator uses (`t0`, `t0-s1`, `t0-s1-p2`), because
 * everything downstream — stored progress, the lesson cache, expansion — keys on them.
 * Chapters are left with `children: null`, which is what marks a node as expandable:
 * the learning points under one are still generated on demand, when the learner opens
 * it, exactly as in a generated course.
 */
export function pathRoadmap(path: LearningPath, level?: string): Roadmap {
  const topics: RoadmapNode[] = path.courses.map((course, i) => ({
    id: `t${i}`,
    kind: "topic",
    title: course.title,
    summary: course.summary,
    module: course.module,
    children: course.chapters.map((chapter, j) => ({
      id: `t${i}-s${j}`,
      kind: "subtopic" as const,
      title: chapterTitle(chapter),
      summary: "",
      module: chapterModule(chapter, course.module),
      children: null,
    })),
  }));

  return {
    skill: path.title,
    title: path.title,
    summary: path.summary,
    level,
    goal: path.goal,
    topics,
  };
}
