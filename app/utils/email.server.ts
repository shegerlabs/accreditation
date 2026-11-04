import { EmailClient, KnownEmailSendStatus } from '@azure/communication-email'
import { getErrorMessage } from './misc'
import { getSetting, SettingKeys } from './settings.server'

/**
 * @deprecated Use sendEmailAzure instead. This function uses the Resend API
 * which requires RESEND_API_KEY environment variable. It is kept for reference
 * but sendEmailAzure (Azure Communication Services) is the recommended method.
 */
export async function sendEmail(options: {
	to: string
	subject: string
	text: string
	html?: string
}) {
	console.warn(
		'[Deprecated] sendEmail() is deprecated. Use sendEmailAzure() instead.',
	)

	// Validate RESEND_API_KEY before making request
	if (!process.env.RESEND_API_KEY) {
		console.error('[Email] RESEND_API_KEY is not configured')
		return { status: 'error', error: 'Email service not configured' } as const
	}

	const email = {
		from: 'noreply@accreditation.com',
		...options,
	}

	const response = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		body: JSON.stringify(email),
		headers: {
			Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
			'content-type': 'application/json',
		},
	})

	const data = await response.json()

	if (response.ok) {
		return { status: 'success' } as const
	} else {
		return { status: 'error', error: getErrorMessage(data) } as const
	}
}

export async function sendEmailAzure(options: {
	to: string
	subject: string
	plainText: string
	html?: string
}) {
	const { to, subject, plainText, html } = options
	const POLLER_WAIT_TIME = 10

	// Fetch email settings from database
	const [senderAddress, sendTimeoutSeconds] = await Promise.all([
		getSetting<string>(SettingKeys.EMAIL_SENDER_ADDRESS),
		getSetting<number>(SettingKeys.EMAIL_SEND_TIMEOUT_SECONDS),
	])

	const message = {
		senderAddress,
		recipients: {
			to: [{ address: to }],
		},
		content: {
			subject,
			plainText,
			html,
		},
	}

	try {
		const client = new EmailClient(process.env.EMAIL_CONNECTION_STRING || '')
		const poller = await client.beginSend(message)

		if (!poller.getOperationState().isStarted) {
			throw 'Poller was not started.'
		}

		let timeElapsed = 0
		while (!poller.isDone()) {
			poller.poll()

			await new Promise(resolve => setTimeout(resolve, POLLER_WAIT_TIME * 1000))
			timeElapsed += POLLER_WAIT_TIME

			if (timeElapsed > sendTimeoutSeconds) {
				throw 'Polling timed out.'
			}
		}

		if (poller.getResult()?.status === KnownEmailSendStatus.Succeeded) {
			return { status: 'success' } as const
		} else {
			return { status: 'error', error: poller.getResult()?.error } as const
		}
	} catch (error) {
		return { status: 'error', error } as const
	}
}
