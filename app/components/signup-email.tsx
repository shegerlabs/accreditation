import {
	Body,
	Container,
	Head,
	Heading,
	Html,
	Link,
	Section,
	Text,
} from '@react-email/components'
import * as React from 'react'

interface SignupEmailProps {
	otp: string
	verifyUrl: string
}

export function SignupEmail({ otp, verifyUrl }: SignupEmailProps) {
	return (
		<Html>
			<Head />
			<Body style={styles.body}>
				<Container style={styles.container}>
					<Section style={styles.logoSection}>
						<Heading style={styles.heading}>Welcome to Accredition</Heading>
					</Section>

					<Section style={styles.mainContent}>
						<Text style={styles.text}>
							Welcome to Accredition. Use the code below to verify your email:
						</Text>

						<Section style={styles.otpSection}>
							<Text style={styles.otp}>{otp}</Text>
						</Section>

						<Text style={styles.text}>
							Alternatively, you can click the button below to verify your
							email:
						</Text>

						<Section style={styles.buttonContainer}>
							<Link style={styles.button} href={verifyUrl.toString()}>
								Verify Email
							</Link>
						</Section>

						<Text style={styles.footer}>
							If you didn&apos;t request this email, please ignore this email.
						</Text>
					</Section>
				</Container>
			</Body>
		</Html>
	)
}

const styles = {
	body: {
		backgroundColor: '#f6f9fc',
		fontFamily:
			'-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
	},
	container: {
		margin: '0 auto',
		padding: '20px 0 48px',
		maxWidth: '580px',
	},
	logoSection: {
		padding: '24px',
	},
	heading: {
		color: '#1f2937',
		fontSize: '24px',
		fontWeight: '600',
		textAlign: 'center' as const,
		margin: '0',
	},
	mainContent: {
		backgroundColor: '#ffffff',
		borderRadius: '8px',
		padding: '40px 32px',
		boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
	},
	text: {
		color: '#374151',
		fontSize: '16px',
		lineHeight: '24px',
		textAlign: 'center' as const,
	},
	otpSection: {
		margin: '32px 0',
	},
	otp: {
		color: '#111827',
		fontSize: '36px',
		fontWeight: 'bold',
		letterSpacing: '0.25em',
		textAlign: 'center' as const,
	},
	buttonContainer: {
		textAlign: 'center' as const,
		margin: '32px 0',
	},
	button: {
		backgroundColor: '#3b82f6',
		borderRadius: '6px',
		color: '#ffffff',
		fontSize: '16px',
		fontWeight: '600',
		textDecoration: 'none',
		textAlign: 'center' as const,
		padding: '12px 32px',
		display: 'inline-block',
	},
	footer: {
		color: '#6b7280',
		fontSize: '14px',
		lineHeight: '24px',
		textAlign: 'center' as const,
		marginTop: '32px',
	},
}
