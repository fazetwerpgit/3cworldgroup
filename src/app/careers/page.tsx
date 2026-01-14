import { redirect } from 'next/navigation';

// Redirect old /careers URL to /opportunities
export default function CareersPage() {
  redirect('/opportunities');
}
