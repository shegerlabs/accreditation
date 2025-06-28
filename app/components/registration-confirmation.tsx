import {
	Body,
	Button,
	Container,
	Head,
	Heading,
	Html,
	Section,
	Text,
} from '@react-email/components'

interface RegistrationEmailProps {
	participantName: string
	registrationCode: string
	eventName: string
	lookupUrl: string
}

export function RegistrationEmail({
	participantName,
	registrationCode,
	eventName,
	lookupUrl,
}: RegistrationEmailProps) {
	return (
		<Html>
			<Head />
			<Body style={{ fontFamily: 'system-ui' }}>
				<Container>
					<Heading>Registration Confirmation</Heading>
					<Text>Dear {participantName},</Text>
					<Text>
						Thank you for registering for {eventName}. Your registration code
						is:
					</Text>
					<Section style={{ textAlign: 'center' }}>
						<Text
							style={{
								fontSize: '24px',
								fontWeight: 'bold',
								padding: '20px',
								backgroundColor: '#f3f4f6',
								borderRadius: '4px',
							}}
						>
							{registrationCode}
						</Text>
					</Section>
					<Text>
						Please keep this code safe. You will need it to access your
						registration details and make any updates to your information.
					</Text>
					<Button
						href={lookupUrl}
						style={{
							backgroundColor: '#3b82f6',
							color: '#ffffff',
							padding: '12px 20px',
							borderRadius: '4px',
							textDecoration: 'none',
						}}
					>
						View Registration Details
					</Button>
				</Container>
			</Body>
		</Html>
	)
}
