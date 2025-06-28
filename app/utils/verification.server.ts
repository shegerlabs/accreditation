import { parseWithZod } from '@conform-to/zod'
import { generateTOTP, verifyTOTP } from '@epic-web/totp'
import { createCookieSessionStorage, json, redirect } from '@remix-run/node'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { z } from 'zod'
import {
	VerificationTypes,
	VerifyFunctionArgs,
	VerifySchema,
} from '~/routes/_auth+/verify'
import { sessionKey } from './auth.server'
import {
	codeQueryParam,
	newEmailAddressSessionKey,
	onboardingEmailSessionKey,
	redirectToQueryParam,
	rememberMeSessionKey,
	resetPasswordUsernameSessionKey,
	targetQueryParam,
	twoFAVerificationType,
	twoFAVerifyVerificationType,
	typeQueryParam,
	unverifiedSessionIdKey,
	verifiedTimeKey,
} from './constants'
import { prisma } from './db.server'
import { sendEmailAzure } from './email.server'
import { getDomainUrl, invariant } from './misc'
import { sessionStorage } from './session.server'
import { redirectWithToast } from './toast.server'

export const verifySessionStorage = createCookieSessionStorage({
	cookie: {
		name: 'verification',
		sameSite: 'lax',
		path: '/',
		httpOnly: true,
		secrets: process.env.SESSION_SECRET.split(','),
		secure: process.env.NODE_ENV === 'production',
		maxAge: 60 * 10,
	},
})

export async function requireOnboardingEmail(request: Request) {
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)

	const email = verifySession.get(onboardingEmailSessionKey)

	if (typeof email !== 'string' || !email) {
		throw redirect('/signup')
	}

	return email
}

export async function isCodeValid({
	code,
	type,
	target,
}: {
	code: string
	type: VerificationTypes | typeof twoFAVerifyVerificationType
	target: string
}) {
	const verification = await prisma.verification.findUnique({
		where: {
			target_type: { target, type },
			OR: [{ expiresAt: { gt: new Date() } }, { expiresAt: null }],
		},
		select: { algorithm: true, secret: true, period: true, charSet: true },
	})

	if (!verification) return false
	const result = verifyTOTP({
		otp: code,
		secret: verification.secret,
		algorithm: verification.algorithm,
		period: verification.period,
		charSet: verification.charSet,
	})

	if (!result) return false

	return true
}

export async function validateRequest(
	request: Request,
	body: URLSearchParams | FormData,
) {
	const submission = await parseWithZod(body, {
		schema: () =>
			VerifySchema.superRefine(async (data, ctx) => {
				const codeIsValid = await isCodeValid({
					code: data[codeQueryParam],
					type: data[typeQueryParam],
					target: data[targetQueryParam],
				})
				if (!codeIsValid) {
					ctx.addIssue({
						path: [codeQueryParam],
						code: z.ZodIssueCode.custom,
						message: `Invalid code`,
					})
					return z.NEVER
				}
			}),

		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { value: submissionValue } = submission

	async function deleteVerification() {
		await prisma.verification.delete({
			where: {
				target_type: {
					target: submissionValue[targetQueryParam],
					type: submissionValue[typeQueryParam],
				},
			},
		})
	}

	switch (submissionValue[typeQueryParam]) {
		case 'onboarding': {
			await deleteVerification()
			return handleOnboardingVerification({ request, body, submission })
		}
		case 'reset-password': {
			await deleteVerification()
			return handlePasswordResetVerification({ request, body, submission })
		}
		case 'change-email': {
			await deleteVerification()
			return handleChangeEmailVerification({ request, body, submission })
		}
		case '2fa': {
			return handleTwoFAVerification({ request, body, submission })
		}
		default:
			throw new Response('Invalid verification type', { status: 500 })
	}
}

export async function handleOnboardingVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	invariant(submission.payload, 'submission.value should be defined by now')
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	verifySession.set(onboardingEmailSessionKey, submission.payload.target)
	return redirect('/onboarding', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}

export async function handlePasswordResetVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	invariant(submission.payload, 'submission.value should be defined by now')
	const target = submission.payload.target as string
	const user = await prisma.user.findFirst({
		where: { OR: [{ email: target }, { username: target }] },
		select: { email: true, username: true },
	})

	// we don't want to say the user is not found if the email is not found
	// because that would allow an attacker to check if an email is registered
	if (!user) {
		return json(
			{
				result: submission.reply({
					fieldErrors: { [codeQueryParam]: ['Invalid Code'] },
				}),
			},
			{ status: 400 },
		)
	}

	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	verifySession.set(resetPasswordUsernameSessionKey, user.username)
	return redirect('/reset-password', {
		headers: {
			'set-cookie': await verifySessionStorage.commitSession(verifySession),
		},
	})
}

export async function handleChangeEmailVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	invariant(submission.payload, 'submission.value should be defined by now')

	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const newEmail = verifySession.get(newEmailAddressSessionKey)
	if (!newEmail) {
		return json(
			{
				result: submission.reply({
					formErrors: [
						'You must submit the code on the same device that you requested the email change',
					],
				}),
			},
			{ status: 400 },
		)
	}

	const target = submission.payload.target as string
	const prevUser = await prisma.user.findUniqueOrThrow({
		where: { id: target },
		select: { email: true },
	})

	const user = await prisma.user.update({
		where: { id: target },
		data: { email: newEmail },
	})

	const emailBody = `We are writing to let you know that your email address has been changed to ${user.email}. \n\n
	If you changed your email address, then you can safely ignore this.\n\n
	But if you didn't change your email address, then please contact support immediately.\n\n
	Your Account ID: ${user.id}`

	void sendEmailAzure({
		to: prevUser.email,
		subject: 'Email Change Notice',
		plainText: emailBody,
		html: `<p>${emailBody}</p>`,
	})

	throw await redirectWithToast('/settings/profile', {
		title: 'Email Changed',
		description: `Your email has been changed to ${user.email}.`,
	})
}

export async function shouldRequestTwoFA({
	request,
	userId,
}: {
	request: Request
	userId: string
}) {
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const unverifiedSessionId = verifySession.get(unverifiedSessionIdKey)
	if (unverifiedSessionId) return true

	const verification = await prisma.verification.findUnique({
		select: { id: true },
		where: {
			target_type: {
				target: userId,
				type: twoFAVerificationType,
			},
		},
	})

	const userHasTwoFAEnabled = Boolean(verification)
	if (!userHasTwoFAEnabled) return false

	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)
	const verifiedTime = new Date(cookieSession.get(verifiedTimeKey) ?? 0)
	if (!verifiedTime) return true

	const twoHoursAgo = 2 * 60 * 60 * 1000

	return Date.now() - verifiedTime.getTime() > twoHoursAgo
}

export async function handleTwoFAVerification({
	request,
	submission,
}: VerifyFunctionArgs) {
	invariant(submission.payload, 'submission.value should be defined by now')
	const cookieSession = await sessionStorage.getSession(
		request.headers.get('cookie'),
	)

	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)

	const rememberMe = verifySession.get(rememberMeSessionKey)
	const redirectTo = submission.payload.redirectTo as string

	const headers = new Headers()
	cookieSession.set(verifiedTimeKey, Date.now())

	const unverifiedSessionId = verifySession.get(unverifiedSessionIdKey)
	if (unverifiedSessionId) {
		const session = await prisma.session.findUnique({
			select: { expirationDate: true },
			where: { id: unverifiedSessionId },
		})

		if (!session) {
			throw await redirectWithToast('/login', {
				type: 'error',
				title: 'Invalid Session',
				description: 'Could not find session to verify. Please try again.',
			})
		}

		cookieSession.set(sessionKey, unverifiedSessionId)

		headers.append(
			'set-cookie',
			await sessionStorage.commitSession(cookieSession, {
				expires: rememberMe ? session.expirationDate : undefined,
			}),
		)
	} else {
		headers.append(
			'set-cookie',
			await sessionStorage.commitSession(cookieSession),
		)
	}

	headers.append(
		'set-cookie',
		await verifySessionStorage.destroySession(verifySession),
	)

	return redirect(safeRedirect(redirectTo), { headers })
}

export async function requireRecentVerification({
	request,
	userId,
}: {
	request: Request
	userId: string
}) {
	const shouldReverify = await shouldRequestTwoFA({ request, userId })
	if (shouldReverify) {
		const reqUrl = new URL(request.url)
		const verifyUrl = getRedirectToUrl({
			request,
			type: twoFAVerificationType,
			target: userId,
			redirectTo: reqUrl.pathname + reqUrl.search,
		})

		throw await redirectWithToast(verifyUrl.toString(), {
			title: 'Please Reverify',
			description: 'You must re-verify your account to continue.',
		})
	}
}

export function getRedirectToUrl({
	request,
	type,
	target,
	redirectTo,
}: {
	request: Request
	type: VerificationTypes
	target: string
	redirectTo?: string
}) {
	const redirectToUrl = new URL(`${getDomainUrl(request)}/verify`)
	redirectToUrl.searchParams.set(typeQueryParam, type)
	redirectToUrl.searchParams.set(targetQueryParam, target)
	if (redirectTo) {
		redirectToUrl.searchParams.set(redirectToQueryParam, redirectTo)
	}
	return redirectToUrl
}

export async function prepareVerification({
	period,
	request,
	type,
	target,
	redirectTo: postVerificationRedirectTo,
}: {
	period: number
	request: Request
	type: VerificationTypes
	target: string
	redirectTo?: string
}) {
	const verifyUrl = getRedirectToUrl({
		request,
		type,
		target,
		redirectTo: postVerificationRedirectTo,
	})
	const redirectTo = new URL(verifyUrl.toString())

	const { otp, ...verificationConfig } = generateTOTP({
		algorithm: 'SHA256',
		period,
	})

	const verificationData = {
		type,
		target,
		...verificationConfig,
		expiresAt: new Date(Date.now() + verificationConfig.period * 1000),
	}
	await prisma.verification.upsert({
		where: { target_type: { target, type } },
		create: verificationData,
		update: verificationData,
	})

	// add the otp to the url we'll email the user.
	verifyUrl.searchParams.set(codeQueryParam, otp)

	return { otp, redirectTo, verifyUrl }
}

export async function requireResetPasswordUsername(request: Request) {
	const verifySession = await verifySessionStorage.getSession(
		request.headers.get('cookie'),
	)

	const resetPasswordUsername = verifySession.get(
		resetPasswordUsernameSessionKey,
	)

	if (typeof resetPasswordUsername !== 'string' || !resetPasswordUsername) {
		throw redirect('/forgot-password')
	}

	return resetPasswordUsername
}
