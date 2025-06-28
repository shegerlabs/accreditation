import { type MetaFunction } from '@remix-run/node'

export const meta: MetaFunction = () => {
	return [{ title: 'Terms of Service - AU Summit Accreditation' }]
}

export default function TermsPage() {
	return (
		<div className="container mx-auto px-4 py-8 md:py-12">
			<h1 className="mb-8 text-3xl font-bold">Terms of Service</h1>

			<div className="prose dark:prose-invert max-w-none">
				<h2>1. Acceptance of Terms</h2>
				<p>
					By accessing and using the AU Summit Accreditation System, you agree
					to be bound by these Terms of Service.
				</p>

				<h2>2. User Responsibilities</h2>
				<p>Users must:</p>
				<ul>
					<li>
						Provide accurate and truthful information during the accreditation
						process
					</li>
					<li>Maintain the confidentiality of their account credentials</li>
					<li>Comply with all applicable laws and regulations</li>
					<li>Not misuse or attempt to compromise the system's security</li>
				</ul>

				<h2>3. Accreditation Process</h2>
				<p>
					The accreditation process is subject to verification and approval.
					Meeting the submission requirements does not guarantee accreditation.
				</p>

				<h2>4. Data Usage</h2>
				<p>
					Information submitted through the system will be used solely for
					accreditation purposes and managed according to our Privacy Policy.
				</p>

				<h2>5. Modifications</h2>
				<p>
					We reserve the right to modify these terms at any time. Users will be
					notified of significant changes.
				</p>

				<h2>6. Limitation of Liability</h2>
				<p>
					The AU Summit Accreditation System is provided "as is" without
					warranties of any kind.
				</p>
			</div>
		</div>
	)
}
