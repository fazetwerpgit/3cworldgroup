import { redirect } from 'next/navigation';

// Shorts now lives as a tab inside University. Keep this route as a redirect so
// old links and bookmarks still land in the right place.
export default function ShortsPage() {
  redirect('/portal/training');
}
