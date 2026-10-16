'use client';

import TrainingModulePage from '@/app/portal/training/[id]/page';
import { P2Harness } from '../../Harness';

// Dev-only: the lesson page under the P2 harness (/design-lab/pass-p2/lesson/m1).
export default function PassP2Lesson() {
  return (
    <P2Harness owner={false}>
      <TrainingModulePage />
    </P2Harness>
  );
}
