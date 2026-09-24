import { redirect } from 'next/navigation';

// Pay Structure is absorbed into Learn's Pay & links tab.
// Keep this route as a redirect so old links and bookmarks still land in the right place.
export default function PayStructurePage() {
  redirect('/portal/learn');
}
