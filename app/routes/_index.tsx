import { json, redirect, type LoaderFunctionArgs } from '@remix-run/node'
import { Link } from '@remix-run/react'
import { Award, ClipboardList, FileCheck, Users } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent } from '~/components/ui/card'
import { getUser, getUserId, logout } from '~/utils/auth.server'
import { useOptionalUser, userHasRole, userHasRoles } from '~/utils/user'

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await getUserId(request)
	const user = userId ? await getUser(userId) : null

	if (userHasRoles(user, ['user', 'focal'])) {
		throw redirect('/events')
	}

	if (
		userHasRoles(user, [
			'admin',
			'mofa-validator',
			'mofa-printer',
			'niss-validator',
		])
	) {
		throw await logout({ request })
	}

	return json({})
}

export default function LandingPage() {
	const user = useOptionalUser()
	if (userHasRole(user, 'admin')) {
		return <></>
	}

	return (
		<div className="flex min-h-screen flex-col">
			<main className="flex-1">
				<section className="flex w-full items-center justify-center bg-gradient-to-b from-white to-gray-100 py-8 dark:from-gray-900 dark:to-gray-800 md:py-16 lg:py-24 xl:py-32">
					<div className="container px-4 md:px-6">
						<div className="flex flex-col items-center space-y-4 text-center">
							<div className="space-y-2">
								<h1 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl lg:text-6xl/none">
									Accreditation for Pan-African Parliament Meetings
								</h1>
								<p className="mx-auto max-w-[700px] text-gray-500 dark:text-gray-400 md:text-xl">
									Secure your participation in this pivotal gathering of
									Parliamentarians from across Africa. Start your accreditation
									process now for the upcoming Pan-African Parliament Meetings.
								</p>
							</div>
							<div className="space-x-4">
								<Button asChild>
									<Link to="/login">Request Accreditation</Link>
								</Button>
								<Button variant="outline" asChild>
									<Link to="/requirements">View Requirements</Link>
								</Button>
							</div>
						</div>
					</div>
				</section>

				<section className="flex w-full items-center justify-center py-12 md:py-24 lg:py-32">
					<div className="container px-4 md:px-6">
						<h2 className="mb-8 text-center text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
							Accreditation Process
						</h2>
						<div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
							<Card>
								<CardContent className="flex flex-col items-center space-y-2 p-6">
									<ClipboardList className="h-12 w-12 text-blue-500" />
									<h3 className="text-xl font-bold">1. Submit Request</h3>
									<p className="text-center text-sm text-gray-500 dark:text-gray-400">
										Fill out the accreditation request form with your details.
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="flex flex-col items-center space-y-2 p-6">
									<FileCheck className="h-12 w-12 text-green-500" />
									<h3 className="text-xl font-bold">2. Provide Documents</h3>
									<p className="text-center text-sm text-gray-500 dark:text-gray-400">
										Upload all required documentation for verification.
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="flex flex-col items-center space-y-2 p-6">
									<Users className="h-12 w-12 text-yellow-500" />
									<h3 className="text-xl font-bold">3. Review Process</h3>
									<p className="text-center text-sm text-gray-500 dark:text-gray-400">
										Our team reviews your application and documents.
									</p>
								</CardContent>
							</Card>
							<Card>
								<CardContent className="flex flex-col items-center space-y-2 p-6">
									<Award className="h-12 w-12 text-purple-500" />
									<h3 className="text-xl font-bold">4. Get Approved</h3>
									<p className="text-center text-sm text-gray-500 dark:text-gray-400">
										Receive your accreditation and prepare for the event.
									</p>
								</CardContent>
							</Card>
						</div>
					</div>
				</section>

				<section className="flex w-full items-center justify-center bg-primary py-12 text-primary-foreground md:py-24 lg:py-32">
					<div className="container px-4 md:px-6">
						<div className="flex flex-col items-center space-y-4 text-center">
							<div className="space-y-2">
								<h2 className="text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
									Ready to Secure Your Participation?
								</h2>
								<p className="mx-auto max-w-[600px] md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
									Don&apos;t miss out on this incredible event. Start your
									accreditation process now!
								</p>
							</div>
							<Button size="lg" variant="secondary" asChild>
								<Link to="/login">Begin Accreditation</Link>
							</Button>
						</div>
					</div>
				</section>
			</main>
		</div>
	)
}
