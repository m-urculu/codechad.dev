// Calibration metadata for the workspace cold-start (2-tap: level + goal).
// Keyed by the module ids used in src/components/Landing.tsx.

export type ModuleMeta = {
  id: string;
  title: string;
  goals: string[]; // real-world tracks; last item is the low-commitment default
};

export const LEVELS = ["New to it", "Some experience", "Experienced"] as const;

export const MODULE_META: Record<string, ModuleMeta> = {
  javascript: { id: "javascript", title: "JavaScript", goals: ["Web & UI", "Backend (Node.js)", "Coding interviews", "Just the language"] },
  typescript: { id: "typescript", title: "TypeScript", goals: ["Typed React/Next apps", "Backend APIs", "Migrating JS", "Just the language"] },
  python: { id: "python", title: "Python", goals: ["Data & AI", "Web & APIs", "Automation & scripting", "Just the language"] },
  ruby: { id: "ruby", title: "Ruby", goals: ["Web (Rails)", "Scripting", "Just the language"] },
  php: { id: "php", title: "PHP", goals: ["Web backends", "WordPress", "Just the language"] },
  c: { id: "c", title: "C", goals: ["Memory & pointers", "Systems programming", "Coding interviews", "Just the language"] },
  cpp: { id: "cpp", title: "C++", goals: ["Coding interviews", "Systems & performance", "Game development", "Just the language"] },
  go: { id: "go", title: "Go", goals: ["Backend services", "CLIs & tooling", "Concurrency", "Just the language"] },
  git: { id: "git", title: "Git", goals: ["Everyday version control", "Branching & merging", "Understanding the internals"] },
  linux: { id: "linux", title: "Linux", goals: ["Everyday command line", "Files & permissions", "Shell scripting", "Just exploring"] },
  lua: { id: "lua", title: "Lua", goals: ["Game scripting", "Embedded config", "Just the language"] },
  postgres: { id: "postgres", title: "PostgreSQL", goals: ["Analytics & queries", "Backend/app dev", "Coding interviews"] },
  sqlite: { id: "sqlite", title: "SQLite", goals: ["App storage", "Learning SQL", "Coding interviews"] },
  duckdb: { id: "duckdb", title: "DuckDB", goals: ["Data analytics", "CSV/Parquet crunching", "Just exploring"] },
  css: { id: "css", title: "CSS", goals: ["Layouts that hold up", "Responsive design", "Animation & polish", "Just the language"] },
  tailwind: { id: "tailwind", title: "Tailwind CSS", goals: ["Building UI fast", "Design systems", "Responsive & dark mode"] },
  react: { id: "react", title: "React", goals: ["UI components", "Full apps", "Coding interviews"] },
  vue: { id: "vue", title: "Vue", goals: ["UI components", "Full apps", "Just exploring"] },
  wasm: { id: "wasm", title: "WebAssembly", goals: ["Run native code on the web", "Performance work", "Just exploring"] },
  graphics: { id: "graphics", title: "Three.js / WebGPU", goals: ["3D on the web", "Data visualization", "Creative coding"] },
  ml: { id: "ml", title: "AI / ML", goals: ["Run models in-browser", "Understand the fundamentals", "Build AI features"] },

  // Path-only modules (see src/lib/paths.ts). They are never opened from the landing
  // grid — a path node names them — but a lesson on one still asks for the module's
  // title (the docs pane header) and its goals (a recalibration in course settings).
  docker: { id: "docker", title: "Docker", goals: ["Containerising an app", "Local dev environments", "Shipping images"] },
  kubernetes: { id: "kubernetes", title: "Kubernetes", goals: ["Deploying services", "Operating a cluster", "Understanding the objects"] },
  aws: { id: "aws", title: "AWS", goals: ["Hosting an app", "Storage & CDNs", "IAM & security"] },
  cicd: { id: "cicd", title: "CI/CD", goals: ["Testing every PR", "Automating deploys", "Pipeline security"] },
  rabbitmq: { id: "rabbitmq", title: "RabbitMQ", goals: ["Decoupling services", "Work queues", "Event-driven design"] },
  powerbi: { id: "powerbi", title: "Power BI", goals: ["Building dashboards", "Modeling & DAX", "Reporting for stakeholders"] },
  pygame: { id: "pygame", title: "Pygame", goals: ["Building a game loop", "2D games", "Just exploring"] },
  career: { id: "career", title: "Career", goals: ["Landing a first job", "Portfolio & resume", "Interview prep"] },
};

export function getModuleMeta(id?: string | null): ModuleMeta | null {
  return id ? MODULE_META[id] ?? null : null;
}
