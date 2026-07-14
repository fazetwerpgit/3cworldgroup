import { redirect } from 'next/navigation';

// Links is absorbed into the Resources hub's Field tools lane. Keep this
// route as a redirect so old links and bookmarks still land in the right place.
export default function LinksPage() {
  redirect('/portal/resources');
}
