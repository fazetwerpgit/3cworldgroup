import { redirect } from 'next/navigation';

export default function ApprovalsPage() {
  redirect('/portal/sales?status=pending');
}
