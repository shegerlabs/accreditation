import { FileImage, FileText, Mail } from 'lucide-react'
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

export function Requirements() {
	return (
		<Card className="space-y-6 p-6">
			<h2 className="text-lg font-semibold">Registration Requirements</h2>

			<InfoSection icon={FileImage} title="Photo and Passport Requirements">
				<ul className="list-inside list-disc space-y-1 pl-5 text-sm text-muted-foreground">
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
				<ul className="list-inside list-disc space-y-1 pl-5 text-sm text-muted-foreground">
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

			<InfoSection icon={Mail} title="Confirmation and Support">
				<p className="text-sm text-muted-foreground">
					Check your email for the confirmation letter.
				</p>
				<p className="text-sm text-muted-foreground">
					For inquiries:{' '}
					<a
						href="mailto:accreditation@mfa.gov.et"
						className="text-primary hover:underline"
					>
						accreditation@mfa.gov.et
					</a>
				</p>
				<p className="text-sm text-muted-foreground">
					Help desk: +251 11 518 2744 / +251 11 518 2745 / +251 11 518 2746
				</p>
			</InfoSection>
		</Card>
	)
}
