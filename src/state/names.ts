import crypto from "node:crypto";

// Curated pool of names from computing / mathematics / engineering history.
// Pure-display labels for AgentRecord — agentId stays the canonical handle,
// so adding / reordering this pool can never break routing, branch parsing,
// or directory paths. New names are safe to append.
export const NAME_POOL: readonly string[] = [
  "Ada", "Alan", "Albert", "Alonzo", "Andrei", "Archimedes", "Aristotle",
  "Aryabhata", "Bhaskara", "Blaise", "Bohr", "Boole", "Bose", "Brahmagupta",
  "Brouwer", "Cantor", "Cauchy", "Cayley", "Chaitin", "Charles", "Church",
  "Cleo", "Clifford", "Codd", "Cohen", "Conway", "Cook", "Copernicus",
  "Cormen", "Curie", "Curry", "Dahl", "Dantzig", "Darwin", "Dedekind",
  "Descartes", "Diffie", "Dijkstra", "Dirac", "Donald", "Edsger", "Eilenberg",
  "Einstein", "Eratosthenes", "Erdos", "Erlang", "Euclid", "Eudoxus", "Euler",
  "Evelyn", "Faraday", "Fei", "Fermat", "Feynman", "Fibonacci", "Floyd",
  "Fourier", "Frances", "Frege", "Friedrich", "Galileo", "Galois", "Gauss",
  "George", "Godel", "Grace", "Hamilton", "Hardy", "Hassler", "Hawking",
  "Hedy", "Heisenberg", "Henri", "Hermann", "Hertz", "Hilbert", "Hipparchus",
  "Hippasus", "Hoare", "Hopper", "Howard", "Hypatia", "Iyengar", "Jacobi",
  "Jane", "Janelle", "Jean", "John", "Joseph", "Joy", "Karen", "Katherine",
  "Khalil", "Khwarizmi", "Kleene", "Knuth", "Kolmogorov", "Kovalevskaya",
  "Kronecker", "Kummer", "Lagrange", "Lamarr", "Lambert", "Lamport",
  "Landau", "Laplace", "Lavoisier", "Lebesgue", "Legendre", "Leibniz",
  "Leslie", "Levi", "Linus", "Lipschitz", "Lise", "Liskov", "Lovelace",
  "Mae", "Malik", "Mandelbrot", "Margaret", "Marie", "Markov", "Mary",
  "Maryam", "Maxwell", "McCarthy", "Meitner", "Mendel", "Mercator", "Mersenne",
  "Mihaela", "Milgram", "Milne", "Mira", "Mirzakhani", "Naomi", "Napier",
  "Nash", "Neumann", "Newton", "Niels", "Nikola", "Niloufar", "Nyquist",
  "Oersted", "Ohm", "Olga", "Oppenheimer", "Pascal", "Pasteur", "Patrick",
  "Paul", "Pauli", "Perelman", "Pieter", "Planck", "Plato", "Poincare",
  "Poisson", "Polya", "Postel", "Ptolemy", "Pythagoras", "Radia", "Rajagopal",
  "Ramanujan", "Raman", "Reed", "Riemann", "Ritchie", "Rosalind", "Russell",
  "Saadia", "Sally", "Saunders", "Scholze", "Schrodinger", "Seki", "Selma",
  "Shannon", "Shing", "Shreya", "Sierpinski", "Sofia", "Stallman", "Stephen",
  "Steve", "Stokes", "Sundar", "Tagore", "Tao", "Tarski", "Tesla", "Thales",
  "Tim", "Torvalds", "Tu", "Turing", "Vera", "Vidya", "Vint", "Wallis",
  "Wassily", "Watson", "Weierstrass", "Wernher", "Wiles", "Wirth",
  "Wittgenstein", "Yann", "Yoshua", "Zhang", "Zuse",
];

const POOL_SIZE = NAME_POOL.length;

/**
 * Pick a display name for a freshly-minted agent.
 *
 * - Deterministic given agentId: identical agentId always hashes to the same
 *   pool offset, so re-deriving a name on a record that lost its `name` field
 *   yields the same result.
 * - Linear-probes the pool on collision against `takenNames`.
 * - If the entire pool is exhausted, falls back to "<base>-<hexSuffix>" using
 *   the agentId's hex tail (e.g. "Ada-d396") — keeps display unique without
 *   inventing new mythology entries.
 */
export function pickName(agentId: string, takenNames: Iterable<string>): string {
  const taken = new Set<string>();
  for (const t of takenNames) taken.add(t);

  const hash = crypto.createHash("sha256").update(agentId).digest();
  const start = hash.readUInt32BE(0) % POOL_SIZE;

  for (let step = 0; step < POOL_SIZE; step++) {
    const candidate = NAME_POOL[(start + step) % POOL_SIZE];
    if (!taken.has(candidate)) return candidate;
  }

  const suffix = agentId.replace(/^agent-/, "");
  const base = NAME_POOL[start];
  return `${base}-${suffix}`;
}
