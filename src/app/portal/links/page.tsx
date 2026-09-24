import { redirect } from 'next/navigation';

// Links is absorbed into Learn's Pay & links tab (Field tools). Keep this
// route as a redirect so old links and bookmarks still land in the right place.
export default function LinksPage() {
  redirect('/portal/learn');
}
