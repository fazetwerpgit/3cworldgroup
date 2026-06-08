# 3C Portal Redesign V2 - Boss Doc Compliance

Gemini model gate: passed with `gemini-3.1-pro-preview`.

## Implemented Or Preserved

- IBO onboarding: W-9, contract, onboarding submission, direct deposit, pay structure, LLC / Secretary of State, insurance upload, and credit card / background check / drug screen reference-only collection.
- Rep, L1, and L2 onboarding: shared field checklist plus Xfinity direct and DSI channel credentialing flow in pipeline/admin views.
- Backend recruiting platform: processing, need logins, cleared to sell, manager field-train message, online training, active, and decommissioning flow.
- Decommission reasons: non activity, wrongdoing in field, manager fire.
- Channels: Frontier, AT&T, Ripple, Brightspeed, Kinetic, T-Fiber, Vivint, DirecTV, and Xfinity.
- Calls: onboarding, Day 1, Day 2, Day 3, Monday team, Thursday team, manager, and IBO call starters.
- Team Chat pilot: text-only Firebase-backed portal chat, no paid SaaS, no media hosting.

## Design Rules

- Employee portal only. Public marketing pages stay out of scope.
- Ops Console direction with purposeful flare: dense status surfaces, channel rails, Lucide icons, shadcn primitives, 150-300ms transitions, and reduced-motion support.
- No emoji-as-icons, hype copy, decorative neon, looping decoration, or generic AI gradient treatment.
