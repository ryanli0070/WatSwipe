/**
 * Mock postings so the app runs standalone (no extension / no WaterlooWorks).
 * Enough rows to visibly prove the 3-card virtualization while swiping.
 */
const COMPANIES = [
  "Acme AI", "Bright Web Co", "DataForge", "Northwind", "Quanta Labs",
  "Helix Systems", "Maple Robotics", "Cobalt Cloud", "Vertex Health", "Lumen IO",
];
const ROLES = [
  ["Machine Learning Engineer", ["python", "ml", "pytorch"], "Train and deploy ML models on large datasets."],
  ["Frontend Developer", ["react", "typescript", "css"], "Build responsive React interfaces and design systems."],
  ["Backend Engineer", ["python", "fastapi", "postgres"], "Design stateless services and data pipelines."],
  ["Data Analyst", ["sql", "tableau", "excel"], "Turn raw data into dashboards and insights."],
  ["DevOps Engineer", ["aws", "terraform", "docker"], "Automate CI/CD and cloud infrastructure."],
  ["Mobile Developer", ["swift", "kotlin", "flutter"], "Ship cross-platform mobile features."],
];
const TERMS = ["Fall 2026", "Winter 2027"];

export const mockJobs = Array.from({ length: 24 }, (_, i) => {
  const [title, tags, description] = ROLES[i % ROLES.length];
  return {
    id: `mock-${1000 + i}`,
    title,
    company: COMPANIES[i % COMPANIES.length],
    location: ["Toronto, ON", "Waterloo, ON", "Remote", "Vancouver, BC"][i % 4],
    term: TERMS[i % TERMS.length],
    status: "Open",
    description,
    tags,
    deadline: "2026-07-15",
    applied: false,
    scrapedAt: new Date().toISOString(),
  };
});
