import { FileImage, FileText, Mail } from 'lucide-react'
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '~/components/ui/accordion'
import { Card } from '~/components/ui/card'

export function InfoSection({
	icon: Icon,
	title,
	children,
}: {
	icon: React.ElementType
	title: string
	children: React.ReactNode
}) {
	return (
		<div className="space-y-2">
			<h3 className="flex items-center font-medium text-gray-800">
				<Icon className="mr-2 h-5 w-5 text-primary" />
				{title}
			</h3>
			{children}
		</div>
	)
}

export function Requirements({ collapsible = true }: { collapsible?: boolean }) {
	const content = (
		<div className="space-y-4">
			<InfoSection icon={FileImage} title="Photo and Passport Requirements">
				<ul className="list-inside list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
					<li className="text-red-500">
						File size: Less than 2MB, Format: JPG or PNG
					</li>
					<li className="text-red-500">
						Photo: 35x45mm, plain background, no accessories, visible ears
					</li>
					<li className="text-red-500">
						Passport: Name, dates & photos must be clearly visible
					</li>
					<li className="text-red-500">
						Passport: Must be valid for at least 6 months beyond your intended
						stay
					</li>
				</ul>
			</InfoSection>

			<InfoSection icon={FileText} title="Participation Letter Guidelines">
				<ul className="list-inside list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
					<li className="text-red-500">
						File size: Less than 2MB, Format: PDF, PNG, or JPG
					</li>
					<li className="text-red-500">
						Content: Clear stamps and delegate names
					</li>
					<li className="text-red-500">
						Participant&apos;s name must be included in the letter
					</li>
				</ul>
			</InfoSection>

			{/* <InfoSection icon={Mail} title="Confirmation and Support">
				<div className="space-y-2 pl-5">
					<p className="text-sm text-muted-foreground">
						Check your email for the confirmation letter.
					</p>
					<p className="text-sm text-muted-foreground">
						For inquiries:{' '}
						<a
							href="mailto:accreditation@mfa.gov.et"
							className="text-primary hover:underline"
						>
							acerwc-secretariat@africanunion.org
						</a>
					</p>
					<p className="text-sm text-muted-foreground">
						Help desk: +266 5605 9300
					</p>
				</div>
			</InfoSection> */}
		</div>
	)

	if (collapsible) {
		return (
			<Card className="p-2">
				<Accordion type="single" collapsible defaultValue="">
					<AccordionItem value="requirements" className="border-none">
						<AccordionTrigger className="py-1 text-sm font-semibold hover:no-underline">
							Registration Requirements
						</AccordionTrigger>
						<AccordionContent className="space-y-4 pt-3 pb-2">
							{content}
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			</Card>
		)
	}

	return <div className="space-y-4">{content}</div>
}
