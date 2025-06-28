import { json } from '@remix-run/node'
import { Link } from '@remix-run/react'
import { ArrowRight, FileImage, FileText } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

export async function loader() {
	return json({})
}

export default function EventRequirementsRoute() {
	return (
		<div className="flex min-h-screen flex-col">
			<main className="flex-1">
				<section className="w-full py-12">
					<div className="container px-4 md:px-6">
						<h2 className="mb-8 text-center text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl">
							Document Requirements
						</h2>
						<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center">
										<FileImage className="mr-2 h-5 w-5 text-blue-500" />
										Photo Requirements
									</CardTitle>
								</CardHeader>
								<CardContent>
									<ul className="ml-5 list-disc space-y-2 text-sm">
										<li>File size: Less than 2MB</li>
										<li>Format: JPG or PNG</li>
										<li>Dimensions: As specified in the application</li>
										<li>Plain background, no accessories, visible face</li>
									</ul>
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center">
										<FileText className="mr-2 h-5 w-5 text-green-500" />
										Identification Documents
									</CardTitle>
								</CardHeader>
								<CardContent>
									<ul className="ml-5 list-disc space-y-2 text-sm">
										<li>File size: Less than 2MB</li>
										<li>Format: JPG, PNG, or PDF</li>
										<li>Clear and legible scan of the entire document</li>
										<li>All information must be clearly visible</li>
									</ul>
								</CardContent>
							</Card>
							<Card>
								<CardHeader>
									<CardTitle className="flex items-center">
										<FileText className="mr-2 h-5 w-5 text-yellow-500" />
										Supporting Documents
									</CardTitle>
								</CardHeader>
								<CardContent>
									<ul className="ml-5 list-disc space-y-2 text-sm">
										<li>File size: Less than 2MB per document</li>
										<li>Format: PDF preferred (JPG or PNG accepted)</li>
										<li>All text must be clear and legible</li>
										<li>Documents must be current and valid</li>
									</ul>
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
									Ready to Register?
								</h2>
								<p className="mx-auto max-w-[600px] md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
									Ensure you have all required documents ready before starting
									your registration.
								</p>
							</div>
							<Button size="lg" variant="secondary" asChild>
								<Link
									to="/login"
									className="inline-flex items-center justify-center"
								>
									Begin Registration
									<ArrowRight className="ml-2 h-4 w-4" />
								</Link>
							</Button>
						</div>
					</div>
				</section>
			</main>
		</div>
	)
}
