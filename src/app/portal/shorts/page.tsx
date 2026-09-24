import { redirect } from 'next/navigation';

// Shorts now lives inside Learn's Training tab. Keep this route as a redirect so
// old links and bookmarks still land in the right place.
export default function ShortsPage() {
  redirect('/portal/learn?tab=training&view=shorts');
}
