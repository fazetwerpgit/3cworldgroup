// Plain JS with a hand-written .d.ts beside it, on purpose: importing
// '@firebase/auth/internal' from TypeScript loads Firebase's internal typings,
// whose global Window.grecaptcha clashes with SignupForm's and fails the build.
export { _getInstance } from '@firebase/auth/internal';
