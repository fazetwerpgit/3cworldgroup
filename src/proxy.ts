import { NextResponse, type NextRequest } from 'next/server';
import { isReadMethod, READ_ONLY_ERROR, VIEW_AS_HEADER } from '@/lib/auth/viewAsHeader';

// "View as rep" is READ ONLY, enforced here for every portal API route at once:
// a write (any non-GET/HEAD/OPTIONS method) that carries the view-as header is
// refused before it reaches a handler, whoever sends it. Reads pass through and
// each rep GET handler checks the header itself (lib/auth/viewAs resolveSubject).
export function proxy(request: NextRequest) {
  if (request.headers.has(VIEW_AS_HEADER) && !isReadMethod(request.method)) {
    return NextResponse.json({ error: READ_ONLY_ERROR }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/api/portal/:path*',
};
