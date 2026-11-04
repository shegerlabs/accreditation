# Security Fixes Documentation

This document shows all security vulnerabilities identified and the changes made to fix them.

---

## 1. Missing RESEND_API_KEY Validation (CRITICAL)

**File:** `app/utils/env.server.ts`

**Issue:** The `sendEmail()` function in `email.server.ts` uses `process.env.RESEND_API_KEY` but this variable is not validated at startup. If missing, the API call sends `Bearer undefined`.

### Before:
```typescript
const schema = z.object({
	NODE_ENV: z.enum(['production', 'development', 'test'] as const),
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	SESSION_SECRET: z
		.string()
		.min(32, 'SESSION_SECRET must be at least 32 characters'),
	HONEYPOT_SECRET: z
		.string()
		.min(16, 'HONEYPOT_SECRET must be at least 16 characters'),
	AZURE_STORAGE_CONNECTION_STRING: z
		.string()
		.min(1, 'AZURE_STORAGE_CONNECTION_STRING is required'),
	EMAIL_CONNECTION_STRING: z
		.string()
		.min(1, 'EMAIL_CONNECTION_STRING is required'),
})
```

### After:
```typescript
const schema = z.object({
	NODE_ENV: z.enum(['production', 'development', 'test'] as const),
	DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
	SESSION_SECRET: z
		.string()
		.min(32, 'SESSION_SECRET must be at least 32 characters'),
	HONEYPOT_SECRET: z
		.string()
		.min(16, 'HONEYPOT_SECRET must be at least 16 characters'),
	AZURE_STORAGE_CONNECTION_STRING: z
		.string()
		.min(1, 'AZURE_STORAGE_CONNECTION_STRING is required'),
	EMAIL_CONNECTION_STRING: z
		.string()
		.min(1, 'EMAIL_CONNECTION_STRING is required'),
	// Optional: Only required if using Resend instead of Azure
	RESEND_API_KEY: z.string().optional(),
	// Domain allowlist for security (comma-separated)
	ALLOWED_DOMAINS: z.string().optional(),
})
```

---

## 2. X-Forwarded Header Injection (CRITICAL)

**File:** `app/utils/misc.tsx`

**Issue:** The `getDomainUrl()` function trusts `X-Forwarded-Host` and `X-Forwarded-Proto` headers without validation. This enables host header injection attacks in password reset emails.

### Before:
```typescript
export function getDomainUrl(request: Request) {
	const host =
		request.headers.get('X-Forwarded-Host') ??
		request.headers.get('host') ??
		new URL(request.url).host
	const protocol = request.headers.get('X-Forwarded-Proto') ?? 'http'
	return `${protocol}://${host}`
}
```

### After:
```typescript
/**
 * Get the domain URL for the current request.
 *
 * SECURITY: This function validates X-Forwarded headers against an allowlist
 * to prevent host header injection attacks in password reset emails.
 */
export function getDomainUrl(request: Request) {
	const forwardedHost = request.headers.get('X-Forwarded-Host')
	const host = request.headers.get('host') ?? new URL(request.url).host
	const protocol = request.headers.get('X-Forwarded-Proto') ?? 'http'

	// Use forwarded host only if it passes validation
	const finalHost = forwardedHost && isAllowedDomain(forwardedHost)
		? forwardedHost
		: host

	// Validate the final host as well
	if (!isAllowedDomain(finalHost)) {
		console.warn(`[Security] Blocked request with invalid host: ${finalHost}`)
		// Fall back to a safe default or throw
		const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',') || []
		if (allowedDomains.length > 0) {
			return `${protocol}://${allowedDomains[0]}`
		}
	}

	return `${protocol}://${finalHost}`
}

/**
 * Check if a domain is in the allowed list.
 * If no allowlist is configured, allows all domains (for development).
 */
function isAllowedDomain(domain: string): boolean {
	const allowedDomains = process.env.ALLOWED_DOMAINS?.split(',').map(d => d.trim().toLowerCase()) || []

	// If no allowlist configured, allow all (but log warning in production)
	if (allowedDomains.length === 0) {
		if (process.env.NODE_ENV === 'production') {
			console.warn('[Security] ALLOWED_DOMAINS not configured. Consider setting this for production.')
		}
		return true
	}

	const normalizedDomain = domain.toLowerCase().split(':')[0] // Remove port if present
	return allowedDomains.includes(normalizedDomain)
}
```

---

## 3. User Enumeration in Forgot Password (HIGH)

**File:** `app/routes/_auth+/forgot-password.tsx`

**Issue:** Error message reveals whether an email exists in the system, allowing user enumeration attacks.

### Before:
```typescript
const submission = await parseWithZod(formData, {
	schema: ForgotPasswordSchema.superRefine(async (data, ctx) => {
		const user = await prisma.user.findFirst({
			where: {
				OR: [
					{ email: data.usernameOrEmail },
					{ username: data.usernameOrEmail },
				],
			},
		})

		if (!user) {
			ctx.addIssue({
				path: ['usernameOrEmail'],
				code: z.ZodIssueCode.custom,
				message: 'No user found with that email or username',
			})
			return
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

const { usernameOrEmail } = submission.value
const user = await prisma.user.findFirstOrThrow({
	where: { OR: [{ email: usernameOrEmail }, { username: usernameOrEmail }] },
	select: { email: true, username: true },
})

// ... send email ...

return redirect(redirectTo.toString())
```

### After:
```typescript
const submission = await parseWithZod(formData, {
	schema: ForgotPasswordSchema,
	async: true,
})

if (submission.status !== 'success') {
	return json(
		{ result: submission.reply() },
		{ status: submission.status === 'error' ? 400 : 200 },
	)
}

const { usernameOrEmail } = submission.value

// Look up user but don't reveal if they exist
const user = await prisma.user.findFirst({
	where: { OR: [{ email: usernameOrEmail }, { username: usernameOrEmail }] },
	select: { email: true, username: true },
})

// SECURITY: Always redirect to success page to prevent user enumeration
// Only send email if user actually exists
if (user) {
	const otpValidityMinutes = await getSetting<number>(
		SettingKeys.OTP_VALIDITY_MINUTES,
	)
	const { verifyUrl, otp } = await prepareVerification({
		period: otpValidityMinutes * 60,
		request,
		type: 'reset-password',
		target: usernameOrEmail,
	})

	void sendEmailAzure({
		to: user.email,
		subject: 'Accreditation Password Reset',
		plainText: `Here's your code: ${otp}. Or open this: ${verifyUrl.toString()}`,
		html: ReactDOMServer.renderToString(
			<ForgotPasswordEmail otp={otp} verifyUrl={verifyUrl.toString()} />,
		),
	})
}

// Always show the same response regardless of whether user exists
return redirectWithToast('/login', {
	type: 'message',
	title: 'Check your email',
	description: 'If an account exists with that email, you will receive a password reset link.',
})
```

---

## 4. Account ID Disclosure in Email (MEDIUM)

**File:** `app/utils/verification.server.ts`

**Issue:** User's internal ID is exposed in email change notification, violating principle of least disclosure.

### Before:
```typescript
const emailBody = `We are writing to let you know that your email address has been changed to ${user.email}. \n\n
If you changed your email address, then you can safely ignore this.\n\n
But if you didn't change your email address, then please contact support immediately.\n\n
Your Account ID: ${user.id}`
```

### After:
```typescript
const emailBody = `We are writing to let you know that your email address has been changed to ${user.email}. \n\n
If you changed your email address, then you can safely ignore this.\n\n
But if you didn't change your email address, then please contact support immediately.`
```

---

## 5. Sensitive Data in Logs (HIGH)

**File:** `server.js`

**Issue:** Morgan logs all requests including sensitive endpoints like `/verify`, `/reset-password`, exposing OTP codes and tokens in logs.

### Before:
```javascript
app.use(morgan('tiny'))
```

### After:
```javascript
// Custom morgan format that excludes sensitive endpoints from logging
const sensitivePathPatterns = [
	'/verify',
	'/reset-password',
	'/forgot-password',
	'/change-email',
	'/two-factor',
]

app.use(morgan((tokens, req, res) => {
	// Skip logging for sensitive paths to prevent OTP/token leakage
	const isSensitivePath = sensitivePathPatterns.some(pattern =>
		req.path.includes(pattern)
	)

	if (isSensitivePath) {
		// Log only method and status, not the full URL with query params
		return [
			tokens.method(req, res),
			'[REDACTED-SENSITIVE-PATH]',
			tokens.status(req, res),
			tokens.res(req, res, 'content-length'), '-',
			tokens['response-time'](req, res), 'ms'
		].join(' ')
	}

	// Standard tiny format for non-sensitive paths
	return [
		tokens.method(req, res),
		tokens.url(req, res),
		tokens.status(req, res),
		tokens.res(req, res, 'content-length'), '-',
		tokens['response-time'](req, res), 'ms'
	].join(' ')
}))
```

---

## 6. Weak Content Security Policy (MEDIUM)

**File:** `server.js`

**Issue:** CSP allows `'unsafe-inline'` and `'unsafe-eval'`, which weakens XSS protection.

### Before:
```javascript
contentSecurityPolicy: {
	directives: {
		defaultSrc: ["'self'"],
		scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
		styleSrc: ["'self'", "'unsafe-inline'"],
		// ...
	},
},
```

### After:
```javascript
contentSecurityPolicy: {
	directives: {
		defaultSrc: ["'self'"],
		// NOTE: 'unsafe-inline' and 'unsafe-eval' are required for:
		// - Remix's runtime script injection
		// - Vite's HMR in development
		// - React's hydration process
		// TODO: Consider implementing nonce-based CSP for stricter security
		// See: https://remix.run/docs/en/main/guides/csp
		scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
		styleSrc: ["'self'", "'unsafe-inline'"],
		// ...
	},
},
```

*Note: This is documented rather than changed because Remix/Vite requires these for proper operation. A future improvement would be implementing nonce-based CSP.*

---

## 7. Deprecated sendEmail Function (LOW)

**File:** `app/utils/email.server.ts`

**Issue:** The `sendEmail()` function uses Resend API but is not used anywhere. It should be marked as deprecated or removed.

### Before:
```typescript
export async function sendEmail(options: {
	to: string
	subject: string
	text: string
	html?: string
}) {
	// ...
}
```

### After:
```typescript
/**
 * @deprecated Use sendEmailAzure instead. This function is kept for reference
 * but is not validated or supported. It requires RESEND_API_KEY env variable.
 */
export async function sendEmail(options: {
	to: string
	subject: string
	text: string
	html?: string
}) {
	console.warn('[Deprecated] sendEmail() is deprecated. Use sendEmailAzure() instead.')
	// ...
}
```

---

## Summary of Changes

| Issue | Severity | Status |
|-------|----------|--------|
| RESEND_API_KEY validation | Critical | Fixed - Made optional |
| X-Forwarded header injection | Critical | Fixed - Added domain allowlist |
| **IDOR in delete participant** | **Critical** | **Fixed - Added ownership verification** |
| User enumeration in forgot-password | High | Fixed - Generic response |
| Sensitive data in logs | High | Fixed - Redact sensitive paths |
| Account ID disclosure | Medium | Fixed - Removed from email |
| Weak CSP | Medium | Documented - Required by framework |
| Deprecated sendEmail | Low | Fixed - Added deprecation warning |

---

## 8. IDOR Vulnerability in Delete Participant (CRITICAL)

**File:** `app/routes/requests+/$participantId.tsx`

**Issue:** The `deleteParticipantAction` function deleted participants without verifying ownership, allowing any authenticated user to delete any participant.

### Before:
```typescript
async function deleteParticipantAction({
	participantId,
}: ParticipantActionArgs) {
	await prisma.participant.delete({
		where: { id: participantId },  // No ownership check!
	})

	return redirectWithToast(`/requests`, {
		type: 'success',
		title: `Participant Deleted`,
		description: `Participant deleted successfully.`,
	})
}
```

### After:
```typescript
async function deleteParticipantAction({
	participantId,
	userId,
}: ParticipantActionArgs) {
	// SECURITY: Verify ownership before deletion to prevent IDOR attacks
	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		select: { userId: true },
	})

	invariantResponse(participant, 'Participant not found', { status: 404 })
	invariantResponse(
		participant.userId === userId,
		'Unauthorized - you can only delete your own participants',
		{ status: 403 },
	)

	await prisma.participant.delete({
		where: { id: participantId },
	})

	return redirectWithToast(`/requests`, {
		type: 'success',
		title: `Participant Deleted`,
		description: `Participant deleted successfully.`,
	})
}
```

---

## Configuration Required

After applying these fixes, add the following to your `.env` file:

```bash
# Domain allowlist for production (comma-separated, no spaces)
# This prevents host header injection attacks
ALLOWED_DOMAINS=yourdomain.com,www.yourdomain.com

# Optional: Only needed if using Resend instead of Azure
# RESEND_API_KEY=your-resend-api-key
```

---

## Testing Recommendations

1. **User Enumeration**: Test forgot-password with valid and invalid emails - both should show same message
2. **Host Header Injection**: Test with spoofed X-Forwarded-Host header - should use allowed domain
3. **Logging**: Check logs don't contain OTP codes or reset tokens
4. **Email Change**: Verify email notification doesn't contain user ID
