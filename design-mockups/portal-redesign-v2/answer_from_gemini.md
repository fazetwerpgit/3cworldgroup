<answer_from_gemini>

### 1) Layout Blueprint
The portal utilizes an operational "Ops Console" layout optimized for data-dense workflows, prioritizing efficiency over consumer-grade sparseness.
- **Shell**: A persistent, collapsible left-hand navigation sidebar anchored in 3C Navy (`#0A1F44`) and a slim top command bar featuring a global search/action palette (Cmd/Ctrl+K) for immediate access to tasks.
- **Dashboard**: A "Live Activity Strip" sits at the top, broadcasting real-time system events (e.g., "Rep Jane Doe cleared to sell"). Below, a modular fluid grid houses compact KPI cards, personal pipeline progression, and channel-specific quick stats.
- **Admin/Pipeline**: Edge-to-edge Kanban boards and high-density data tables with inline state management. Detail views open in deep-context right-side slide-outs (Sheets) to avoid losing the primary list context.
- **Onboarding**: A structured, sequential wizard split by role (IBO vs. Rep/L1/L2) featuring a persistent progress timeline on the left and contained, max-width form blocks on the right.
- **Team Chat**: A split-pane architecture reminiscent of Slack but stripped down. Left pane for channels/DMs, right pane for text-only feed to maximize vertical reading space.

### 2) Visual System
The aesthetic is deliberate, professional, and mechanical, shedding generic "AI-generated" styles for a grounded, utility-first feel.
- **Color Tokens**:
  - **Primary Brand/Navigation**: 3C Navy `#0A1F44`. Used for structural elements, active states, and primary typography.
  - **Action/Accent**: 3C Green `#8dc63f`. Used strictly for primary calls-to-action, success states, and positive trend indicators.
  - **Background/Surface**: `#F8FAFC` (Slate 50) for canvas, `#FFFFFF` for data cards with subtle `#E2E8F0` borders.
  - **Status Rails**: Distinct, accessible system colors for progression: Amber (Processing), Blue (Training), Green (Active), Red (Decommissioned/Error).
- **Typography & Components**: Inter (or Geist) for maximum legibility. Dense layouts with tight spacing (e.g., 8px table cell padding). shadcn/ui primitives customized with reduced border radii (e.g., `rounded-md` instead of `lg`) and stripped of heavy drop shadows for a sharper interface.
- **Texture**: Glassmorphism is avoided entirely. Subtle dotted grids in empty states provide an engineering/ops feel. Lucide icons universally replace emojis. No neon gradients.

### 3) Motion Plan
Motion acts as systemic feedback, not decoration.
- **Durations**: Strictly kept to 150�300ms to maintain a snappy, productive feel.
- **Interactions**:
  - **Hover/State Changes**: 150ms `ease-in-out` for background color shifts on buttons, links, and table rows.
  - **Structural Changes**: 300ms `cubic-bezier(0.16, 1, 0.3, 1)` (ease-out) for Sheet slide-ins and modal entrances to convey mechanical precision.
  - **Progress Timelines**: Smooth, linear fill animations on onboarding steps. Zero pulsing, looping, or bouncing.
- **Accessibility**: All motion is wrapped in `prefers-reduced-motion` media queries. If triggered, durations drop to 0ms, falling back to instant opacity and color state shifts.

### 4) Page-by-Page Redesign Map
- **`/portal/dashboard`**: Unified hub. Top Live Activity Strip. Quick-access tiles for Active Pipeline, Sales MTD, and Rank.
- **`/portal/onboarding`**: Role-gated multi-step flow.
  - *IBO Path*: W9, Contract, Direct Deposit, Pay Structure, LLC Sec of State, Insurance Upload, CC capture.
  - *Rep Path*: W9, Contract, Direct Deposit, Pay Structure, Channel Selection (Xfinity/DSI) sub-flows.
- **`/portal/admin/pipeline`**: The Recruiting Hub. Kanban columns mirroring the required stages: Processing, Need Logins, Cleared to Sell, Field-Train Manager Message, Online Training, Active, Decommissioning.
- **`/portal/sales` & `/portal/leaderboard`**: High-performance data tables resembling Salesforce/SPOTIO. Avoids juvenile gamification; uses strict numeric rankings, clean data visualization, and 3C Green trending indicators.
- **`/portal/calls` & `/portal/training`**: Resource library and chronological schedule view. Distinct cards for specific calls (Monday/Thursday team, etc.) with quick "Join" actions.
- **`/portal/chat`**: Text-only Firebase implementation. Clean, dense log format without media placeholders or complex attachment UIs.

### 5) Boss Doc Compliance Matrix
- **IBO Onboarding**: Fully addressed via dedicated dynamic form path capturing W9, LLC docs, Insurance, and CC info.
- **Rep/L1/L2 Onboarding**: Fully addressed via distinct flow integrating Xfinity and DSI specific requirements.
- **Backend Recruiting Counts**: Directly mapped to the new Kanban columns in `/portal/admin/pipeline` (Processing through Decommissioning).
- **Decommission Reasons**: Integrated into the user status change flow (Mandatory dropdown modal prompting for: Non-activity, Wrongdoing, Manager Fire).
- **Channels**: Incorporated as tags/badges on sales entries and onboarding forms (Frontier, AT&T, Ripple, Brightspeed, Kinetic, T-Fiber, Vivint, DirecTV, Xfinity, DSI).
- **Calls**: Categorized and scheduled in the `/portal/calls` UI matching the exact requested nomenclature (Day 1, Day 2, Day 3, Team calls, Manager/IBO calls).
- **Team Chat Pilot**: Built into `/portal/chat` as a strictly text-only, Firebase-backed interface to ensure zero paid SaaS overhead.

### 6) Implementation Notes
- **Framework Setup**: Leverage Next.js 16 App Router. Configure Tailwind v4 variables for `--color-navy: #0A1F44;` and `--color-green: #8dc63f;` mapped directly to primary theme configurations.
- **Component Architecture**: Deeply customize shadcn/ui `components.json` and base css. Override default padding for tables and cards to establish the requested "precise density". Remove default shadows in favor of crisp 1px borders.
- **Forms**: Use `react-hook-form` and `zod` for the complex, branching onboarding flows to handle conditional validation across IBO and Rep paths flawlessly.
- **Chat Optimization**: For the Firebase text-only pilot, keep state localized. Use `limitToLast(50)` on real-time snapshot listeners and simple array mapping to keep client performance high without introducing heavy abstractions.

</answer_from_gemini>
