import { redirect } from 'next/navigation';

// Pay Structure is absorbed into the Resources hub's Pay structure lane.
// Keep this route as a redirect so old links and bookmarks still land in the right place.
export default function PayStructurePage() {
  redirect('/portal/resources');
}
