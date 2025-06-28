import { type MetaFunction } from '@remix-run/node'

export const meta: MetaFunction = () => {
	return [{ title: 'Privacy Policy - AU Summit Accreditation' }]
}

export default function PrivacyPage() {
	return (
		<div className="container mx-auto px-4 py-8 md:py-12">
			<h1 className="mb-8 text-3xl font-bold">Privacy Policy</h1>

			<div className="prose dark:prose-invert max-w-none">
				<h2>1. Information Collection</h2>
				<p>
					We collect information that you provide during the accreditation
					process, including:
				</p>
				<ul>
					<li>Personal identification information</li>
					<li>Contact details</li>
					<li>Professional affiliations</li>
					<li>Documentation required for accreditation</li>
				</ul>

				<h2>2. Use of Information</h2>
				<p>Your information is used for:</p>
				<ul>
					<li>Processing accreditation requests</li>
					<li>Verification of submitted documents</li>
					<li>Communication regarding your accreditation status</li>
					<li>Security and access control during the summit</li>
				</ul>

				<h2>3. Data Protection</h2>
				<p>
					We implement appropriate security measures to protect your personal
					information from unauthorized access, alteration, or disclosure.
				</p>

				<h2>4. Information Sharing</h2>
				<p>Your information may be shared with:</p>
				<ul>
					<li>Relevant AU Summit organizing committees</li>
					<li>Security personnel for verification purposes</li>
					<li>Legal authorities when required by law</li>
				</ul>

				<h2>5. Data Retention</h2>
				<p>
					We retain your information for the duration necessary to fulfill the
					purposes outlined in this policy and to comply with legal
					requirements.
				</p>

				<h2>6. Your Rights</h2>
				<p>You have the right to:</p>
				<ul>
					<li>Access your personal information</li>
					<li>Request corrections to your data</li>
					<li>Request deletion of your data (subject to legal requirements)</li>
					<li>Object to certain data processing activities</li>
				</ul>

				<h2>7. Updates to Policy</h2>
				<p>
					This privacy policy may be updated periodically. Users will be
					notified of significant changes.
				</p>
			</div>
		</div>
	)
}
