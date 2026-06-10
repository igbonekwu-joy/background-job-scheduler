/**
 * Returns a dependency id that would close a cycle if jobId were to depend on it,
 * or null when the new edges are acyclic.
 */
export async function findDependencyCycle(client, jobId, dependencies) {
  const uniqueDeps = [...new Set(dependencies)];

  for (const depId of uniqueDeps) {
    if (depId === jobId) return depId;

    const visited = new Set();
    const stack = [depId];

    while (stack.length) {
      const current = stack.pop();
      if (current === jobId) return depId;
      if (visited.has(current)) continue;
      visited.add(current);

      const { rows } = await client.query(
        `SELECT depends_on FROM job_dependencies WHERE job_id = $1`,
        [current]
      );

      for (const { depends_on } of rows) {
        stack.push(depends_on);
      }
    }
  }

  return null;
}
