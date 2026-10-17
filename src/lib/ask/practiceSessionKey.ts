// The sessionStorage key for a practice session. Its own module so sign-out
// (AuthContext, on every portal page) can clear it without pulling the whole
// practice script library into the portal shell.
export const PRACTICE_SESSION_KEY = 'ask3c-practice';
