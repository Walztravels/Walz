import { redirect } from 'next/navigation'

// The minimal careers CRUD has been superseded by the Recruitment Hub.
// Bookmarks and old links land on the full job manager.
export default function LegacyCareersAdminRedirect() {
  redirect('/admin/recruitment/jobs')
}
