// Shared by the admin and the portal: keep this file identical in both repos.
// No server imports here, so the admin template editor can render live previews.

export type EmailTrigger =
	| 'REQUEST_RECEIVED'
	| 'RETURNED_FOR_CORRECTION'
	| 'BADGE_READY'
	| 'BADGE_COLLECTED'

export const EMAIL_TRIGGERS: EmailTrigger[] = [
	'REQUEST_RECEIVED',
	'RETURNED_FOR_CORRECTION',
	'BADGE_READY',
	'BADGE_COLLECTED',
]

type TemplateDefinition = {
	label: string
	description: string
	subject: string
	body: string
	enabled: boolean
}

export const EMAIL_TEMPLATE_DEFAULTS: Record<EmailTrigger, TemplateDefinition> = {
	REQUEST_RECEIVED: {
		label: 'Request received',
		description:
			'Sent from the portal when a request is registered, and again when a returned request is resubmitted.',
		enabled: true,
		subject: '{eventName}: accreditation request received ({registrationCode})',
		body: `Dear {fullName},

Thank you for registering for {eventName}. We have received your accreditation request and it is now being reviewed.

Your registration code is: {registrationCode}

Please keep this code. You will need it to follow your request or when contacting the accreditation team.

View your request: {lookupLink}`,
	},
	RETURNED_FOR_CORRECTION: {
		label: 'Returned for correction',
		description: 'Sent when a validator or admin rejects a request.',
		enabled: true,
		subject: '{eventName}: your accreditation request needs changes',
		body: `Dear {fullName},

Your accreditation request for {eventName} (registration code {registrationCode}) has been returned for correction.

Reason given by the accreditation team:
{remarks}

Please update your request and submit it again: {editLink}

Once you resubmit it, it will be reviewed again.`,
	},
	BADGE_READY: {
		label: 'Badge ready for collection',
		description: 'Sent when the badge is printed.',
		enabled: true,
		subject: '{eventName}: your badge is ready for collection',
		body: `Dear {fullName},

Your accreditation for {eventName} has been approved and your badge has been printed.

Please collect it at the accreditation desk. Bring your passport and quote your registration code: {registrationCode}`,
	},
	BADGE_COLLECTED: {
		label: 'Badge collected',
		description: 'Sent when the dispatcher records the badge as collected. Off by default.',
		enabled: false,
		subject: '{eventName}: your badge has been collected',
		body: `Dear {fullName},

This confirms that your badge for {eventName} (registration code {registrationCode}) has been collected.

If you did not collect it, please contact the accreditation desk immediately.`,
	},
}

export const EMAIL_PLACEHOLDERS = {
	fullName: 'Title, first name and family name',
	firstName: 'First name',
	familyName: 'Family name',
	eventName: 'Event name',
	registrationCode: 'Registration code',
	participantType: 'Participant type',
	organization: 'Organization',
	remarks: 'Reason given on rejection',
	lookupLink: 'Link to view the request in the portal',
	editLink: 'Link to edit and resubmit the request in the portal',
} as const

export type EmailVariables = Record<keyof typeof EMAIL_PLACEHOLDERS, string>

export const SAMPLE_EMAIL_VARIABLES: EmailVariables = {
	fullName: 'H.E. Amina Mensah',
	firstName: 'Amina',
	familyName: 'Mensah',
	eventName: 'Pan-African Parliament Summit',
	registrationCode: 'PAP-123456',
	participantType: 'Delegate',
	organization: 'Ministry of Foreign Affairs',
	remarks: 'The passport photo is unclear. Please upload a sharper scan.',
	lookupLink: 'https://papevents.africanunion.org/requests/example',
	editLink: 'https://papevents.africanunion.org/requests/example/edit',
}

export function buildEmailVariables(
	participant: {
		id: string
		firstName: string
		familyName: string
		registrationCode: string
		organization: string
		title: { name: string } | null
		event: { name: string }
		participantType: { name: string }
	},
	options: { portalUrl: string; remarks?: string },
): EmailVariables {
	const portalUrl = options.portalUrl.replace(/\/+$/, '')
	const lookupLink = `${portalUrl}/requests/${participant.id}`
	return {
		fullName: [participant.title?.name, participant.firstName, participant.familyName]
			.filter(Boolean)
			.join(' '),
		firstName: participant.firstName,
		familyName: participant.familyName,
		eventName: participant.event.name,
		registrationCode: participant.registrationCode,
		participantType: participant.participantType.name,
		organization: participant.organization,
		remarks:
			options.remarks?.trim() ||
			'No specific reason was given. Please review your details and documents.',
		lookupLink,
		editLink: `${lookupLink}/edit`,
	}
}

// Unknown placeholders are left as typed, so a misspelling shows up in the preview.
export function renderTemplate(text: string, variables: EmailVariables) {
	return text.replace(/\{(\w+)\}/g, (match, key: string) =>
		key in variables ? variables[key as keyof EmailVariables] : match,
	)
}

export function findUnknownPlaceholders(text: string) {
	const unknown = new Set<string>()
	for (const [, key] of text.matchAll(/\{(\w+)\}/g)) {
		if (!(key in EMAIL_PLACEHOLDERS)) unknown.add(key)
	}
	return [...unknown]
}

function escapeHtml(text: string) {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;')
}

// Wraps rendered plain text in the PAP email layout. Blank lines become
// paragraphs and URLs become links. All text is escaped first.
export function buildEmailHtml(subject: string, body: string) {
	const paragraphs = body
		.trim()
		.split(/\n\s*\n/)
		.map(paragraph => {
			const html = escapeHtml(paragraph)
				.replace(
					/https?:\/\/[^\s<]+/g,
					url => `<a href="${url}" style="color:#7a6a3a;text-decoration:underline">${url}</a>`,
				)
				.replace(/\n/g, '<br>')
			return `<p style="margin:0 0 16px;line-height:1.6">${html}</p>`
		})
		.join('')

	return `<!doctype html>
<html>
<head><meta charset="utf-8"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f3ee;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;color:#1f2937">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f3ee;padding:24px 12px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:8px;overflow:hidden">
<tr><td style="background:#c8bd9e;padding:16px 24px;font-size:16px;font-weight:600;color:#1f2937">Pan-African Parliament Accreditation</td></tr>
<tr><td style="padding:24px;font-size:15px">${paragraphs}</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">This is an automated message. Please do not reply to this email.</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
