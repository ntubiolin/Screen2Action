import path from 'path';

// Returns the root directory where recordings are stored.
// For this build, we default to `<projectRoot>/recordings`.
export function getRecordingsDir(): string {
  return path.join(process.cwd(), 'recordings');
}
