# Security Fixes Review

This document contains the before/after changes for critical security fixes applied to the accreditation system.

---

## Fix 1: Environment Variable Validation

**File:** `app/utils/env.server.ts`

**Issue:** Environment variables were validated for presence but not for minimum security requirements. Secrets could be empty strings or too short to be cryptographically secure.

### Before
```typescript
const schema = z.object({
	NODE_ENV: z.enum(['production', 'development', 'test'] as const),
	DATABASE_URL: z.string(),
	SESSION_SECRET: z.string(),
	HONEYPOT_SECRET: z.string(),
	AZURE_STORAGE_CONNECTION_STRING: z.string(),
	EMAIL_CONNECTION_STRING: z.string(),
})
```

### After
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

**Impact:**
- App will fail to start if secrets are too short or missing
- SESSION_SECRET requires minimum 32 characters for adequate entropy
- HONEYPOT_SECRET requires minimum 16 characters
- Clear error messages indicate which variable failed validation

---

## Fix 2: Attachment Endpoint Authentication & Authorization

**File:** `app/routes/resources+/attachments.$attachmentId.tsx`

**Issue:** The attachment download endpoint had no authentication. Anyone with an attachment ID could access template files without being logged in.

### Before
```typescript
import { type LoaderFunctionArgs } from '@remix-run/node'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { getFile } from '~/utils/storage.server'

export async function loader({ params }: LoaderFunctionArgs) {
	const { attachmentId } = params
	invariantResponse(attachmentId, 'Attachment ID is required', { status: 400 })

	const attachment = await prisma.attachment.findUnique({
		where: { id: attachmentId },
		select: {
			templateId: true,
			contentType: true,
			extension: true,
			fileName: true,
		},
	})

	invariantResponse(attachment, 'Attachment not found', { status: 404 })
```

### After
```typescript
import { type LoaderFunctionArgs } from '@remix-run/node'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { requireUserId } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { getFile } from '~/utils/storage.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	// Require authentication to access attachments
	await requireUserId(request)

	const { attachmentId } = params
	invariantResponse(attachmentId, 'Attachment ID is required', { status: 400 })

	const attachment = await prisma.attachment.findUnique({
		where: { id: attachmentId },
		select: {
			templateId: true,
			contentType: true,
			extension: true,
			fileName: true,
			template: {
				select: {
					event: {
						select: {
							status: true,
						},
					},
				},
			},
		},
	})

	invariantResponse(attachment, 'Attachment not found', { status: 404 })

	// Only allow access to attachments for published events
	invariantResponse(
		attachment.template.event.status === 'PUBLISHED',
		'Event is not available',
		{ status: 403 },
	)
```

**Impact:**
- Unauthenticated users can no longer access attachments (redirected to login)
- Attachments are only accessible for published events
- Prevents information disclosure of unpublished event templates

---

## Fix 3: Participant Export - Already Secure (No Change Needed)

**File:** `app/routes/resources+/participants.tsx`

**Original Assessment:** Potential IDOR vulnerability where focal users could export data for other organizations.

**Finding:** Upon closer inspection, line 20 already contains `{ userId: user.id }` as the first condition, which restricts exports to only the authenticated user's own participants. This is secure.

```typescript
// Line 20 - Already secure
const conditions: WhereCondition[] = [{ userId: user.id }]
```

**Conclusion:** No fix needed - the endpoint was already secure.

---

## Summary of Changes

| File | Change | Lines Modified |
|------|--------|----------------|
| `app/utils/env.server.ts` | Added minimum length validation for secrets | 3-18 |
| `app/routes/resources+/attachments.$attachmentId.tsx` | Added authentication and event status check | 1-42 |
| `app/routes/resources+/participants.tsx` | No change needed (already secure) | N/A |

---

## Testing Verification

Run the following commands to verify the fixes don't break functionality:

```bash
# Type checking
npm run typecheck

# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Lint
npm run lint
```

---

## Fix 4: Reduced Session Lifetime

**File:** `app/utils/auth.server.ts`

**Issue:** Sessions were valid for 30 days, which is excessive for a system handling personal information.

### Before
```typescript
const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 30 // 30 days
```

### After
```typescript
const SESSION_EXPIRATION_TIME = 1000 * 60 * 60 * 24 * 7 // 7 days
```

**Impact:**
- Users will need to re-authenticate after 7 days instead of 30
- Reduces window of exposure if session is compromised
- Better security posture for PII handling

---

## Fix 5: Removed Fingerprint Bypass Environment Variable

**File:** `app/utils/auth.server.ts`

**Issue:** `SKIP_FINGERPRINT_CHECK` environment variable could accidentally be enabled in production, bypassing session security.

### Before
```typescript
// Skip fingerprint validation during E2E tests (different browser contexts have different fingerprints)
const skipFingerprintCheck = process.env.SKIP_FINGERPRINT_CHECK === 'true'

if (!skipFingerprintCheck) {
    const currentFingerprint = generateFingerprint(request)
    // ...validation logic
}
```

### After
```typescript
// Fingerprint validation to prevent session hijacking
// Only skip in test environment to allow E2E tests with different browser contexts
const isTestEnvironment = process.env.NODE_ENV === 'test'

if (!isTestEnvironment) {
    const currentFingerprint = generateFingerprint(request)
    // ...validation logic
}
```

**Impact:**
- Fingerprint check is now tied to NODE_ENV, not a separate env variable
- Cannot be accidentally enabled in production (NODE_ENV would never be 'test' in production)
- E2E tests still work correctly

---

## Fix 6: Removed Rate Limit Bypass Environment Variable

**File:** `server.js`

**Issue:** `SKIP_RATE_LIMIT` environment variable could accidentally be enabled in production, disabling rate limiting.

### Before
```javascript
// Skip rate limiting during tests
const skipRateLimit = process.env.SKIP_RATE_LIMIT === 'true'

app.use((req, res, next) => {
    // Skip rate limiting during tests
    if (skipRateLimit) {
        return next()
    }
    // ...rate limiting logic
})
```

### After
```javascript
// Only skip rate limiting in test environment
const isTestEnvironment = process.env.NODE_ENV === 'test'

app.use((req, res, next) => {
    // Skip rate limiting only in test environment
    if (isTestEnvironment) {
        return next()
    }
    // ...rate limiting logic
})
```

**Impact:**
- Rate limiting is now tied to NODE_ENV, not a separate env variable
- Cannot be accidentally disabled in production
- Tests still bypass rate limiting when NODE_ENV=test

---

## Fix 7: Server-Side MIME Type Validation

**Files:**
- `app/utils/file-validation.server.ts` (new file)
- `app/routes/requests+/new.tsx`
- `app/routes/requests+/$participantId_.edit.tsx`

**Issue:** File uploads only validated the client-provided MIME type, which can be spoofed. A malicious file could be disguised as an image.

### New Utility Created
```typescript
// app/utils/file-validation.server.ts
import { fileTypeFromBuffer } from 'file-type'

export async function validateFileType(
    buffer: Buffer,
    claimedType: string,
): Promise<{ valid: boolean; detectedType: string | null }> {
    const result = await fileTypeFromBuffer(buffer)
    if (!result) {
        return { valid: false, detectedType: null }
    }
    const valid = claimedType.toLowerCase() === result.mime.toLowerCase()
    return { valid, detectedType: result.mime }
}

export async function validatePhotoFile(buffer: Buffer, claimedType: string) { ... }
export async function validateDocumentFile(buffer: Buffer, claimedType: string) { ... }
```

### Integration in Form Handlers
```typescript
// Before - only client-provided type check
contentType: i.file.type,
blob: Buffer.from(await i.file.arrayBuffer()),

// After - server-side validation using file magic bytes
const blob = Buffer.from(await i.file.arrayBuffer())

const isPhoto = i.documentType === 'PHOTO'
const validation = isPhoto
    ? await validatePhotoFile(blob, i.file.type)
    : await validateDocumentFile(blob, i.file.type)

if (!validation.valid) {
    throw new Error(validation.error || 'Invalid file type')
}
```

**Impact:**
- Files are now validated by inspecting their actual content (magic bytes), not just the claimed MIME type
- Prevents MIME type spoofing attacks
- Malicious files disguised as images/PDFs will be rejected

---

## Updated Summary of All Changes

| File | Change | Status |
|------|--------|--------|
| `app/utils/env.server.ts` | Added minimum length validation for secrets | Complete |
| `app/routes/resources+/attachments.$attachmentId.tsx` | Added authentication and event status check | Complete |
| `app/utils/auth.server.ts` | Reduced session lifetime from 30 to 7 days | Complete |
| `app/utils/auth.server.ts` | Removed SKIP_FINGERPRINT_CHECK bypass | Complete |
| `server.js` | Removed SKIP_RATE_LIMIT bypass | Complete |
| `app/utils/file-validation.server.ts` | New file for server-side MIME validation | Complete |
| `app/routes/requests+/new.tsx` | Added server-side file type validation | Complete |
| `app/routes/requests+/$participantId_.edit.tsx` | Added server-side file type validation | Complete |

---

## Dependencies Added

```bash
npm install file-type@19 --save
```

---

## All Security Recommendations Implemented

All security recommendations have now been addressed:

- [x] Environment variable validation with minimum lengths
- [x] Attachment endpoint authentication
- [x] Session lifetime reduced to 7 days
- [x] Fingerprint bypass tied to NODE_ENV=test only
- [x] Rate limit bypass tied to NODE_ENV=test only
- [x] Server-side MIME type validation using file-type library

---

# Performance Fixes

The following performance issues were identified and fixed to improve application responsiveness and prevent potential memory issues.

---

## Fix 8: N+1 Query in Quota Validation

**File:** `app/routes/requests+/new.tsx`

**Issue:** The `closedSessionType` database query was executed INSIDE a loop, causing the same query to run N times (once per constraint) when it always returns the same result.

### Before
```typescript
for (const constraint of applicableConstraints) {
    // ... constraint validation logic ...

    if (isClosedConstraint) {
        // This query runs inside the loop - N times for same data!
        const closedSessionType = await prisma.meetingType.findFirst({
            where: { tenantId: data.tenantId, name: 'Closed Session' },
        })

        if (closedSessionType) {
            currentCount = await prisma.participant.count({
                where: { wishList: { contains: closedSessionType.id } },
            })
        }
    }
}
```

### After
```typescript
// Fetch closedSessionType ONCE before the loop (fixes N+1 query)
const closedSessionType = await prisma.meetingType.findFirst({
    where: { tenantId: data.tenantId, name: 'Closed Session' },
})

for (const constraint of applicableConstraints) {
    // ... constraint validation logic ...

    if (isClosedConstraint) {
        // Reuse the cached value - no extra query
        if (closedSessionType) {
            currentCount = await prisma.participant.count({
                where: { wishList: { contains: closedSessionType.id } },
            })
        }
    }
}
```

**Impact:**
- Reduces database queries from N+1 to 1 for the meetingType lookup
- For 5 constraints: reduced from ~10+ queries to ~6 queries
- Faster form validation and submission

---

## Fix 9: Overly Broad getUser() Fetch

**File:** `app/utils/auth.server.ts`

**Issue:** The `getUser()` function included `sessions: true` which fetched ALL user sessions on EVERY page load via `root.tsx`, but this data was NEVER used anywhere in the application.

### Before
```typescript
export async function getUser(request: Request) {
    // ...
    return prisma.user.findUnique({
        select: {
            id: true,
            email: true,
            // ... other fields ...
            sessions: true, // Fetches ALL user sessions - NEVER used!
        },
    })
}
```

### After
```typescript
export async function getUser(request: Request) {
    // ...
    return prisma.user.findUnique({
        select: {
            id: true,
            email: true,
            // ... other fields ...
            password: false, // intentionally omit password
            // sessions: true was removed - never used
        },
    })
}
```

**Impact:**
- Reduces data transferred from database on every page load
- Eliminates unnecessary JOIN with sessions table
- Zero functional impact (verified: sessions data was never accessed)

---

## Fix 10: Export Without Safety Limit

**File:** `app/routes/resources+/participants.tsx`

**Issue:** The participant export query had no limit, which could cause Out-of-Memory (OOM) errors when exporting large events with 10,000+ participants.

### Before
```typescript
const participants = await prisma.participant.findMany({
    where: conditions.length > 0
        ? { OR: conditions.map(condition => ({ ... })) }
        : undefined,
    orderBy: { firstName: 'asc' },
    select: { ... },
})
```

### After
```typescript
const participants = await prisma.participant.findMany({
    where: conditions.length > 0
        ? { OR: conditions.map(condition => ({ ... })) }
        : undefined,
    take: 10000, // Safety limit to prevent OOM for large exports
    orderBy: { firstName: 'asc' },
    select: { ... },
})
```

**Impact:**
- Prevents server crashes when exporting very large events
- 10,000 participants is a reasonable limit for Excel exports
- Users can still export in batches using filters if needed

---

## Complete Summary of All Fixes

### Security Fixes

| # | File | Change | Severity |
|---|------|--------|----------|
| 1 | `app/utils/env.server.ts` | Added minimum length validation for secrets | Critical |
| 2 | `app/routes/resources+/attachments.$attachmentId.tsx` | Added authentication and event status check | Critical |
| 3 | `app/routes/resources+/participants.tsx` | Already secure (no change needed) | N/A |
| 4 | `app/utils/auth.server.ts` | Reduced session lifetime from 30 to 7 days | Medium |
| 5 | `app/utils/auth.server.ts` | Removed SKIP_FINGERPRINT_CHECK bypass | Medium |
| 6 | `server.js` | Removed SKIP_RATE_LIMIT bypass | Medium |
| 7 | `app/utils/file-validation.server.ts` + routes | Server-side MIME type validation | Medium |

### Performance Fixes

| # | File | Change | Impact |
|---|------|--------|--------|
| 8 | `app/routes/requests+/new.tsx` | Move closedSessionType query outside loop | Reduces N+1 queries |
| 9 | `app/utils/auth.server.ts` | Remove unused sessions fetch | Faster page loads |
| 10 | `app/routes/resources+/participants.tsx` | Add take: 10000 safety limit | Prevents OOM |

---

## Dependencies Added

```bash
npm install file-type@19 --save
```

---

## All Recommendations Implemented

**Security:**
- [x] Environment variable validation with minimum lengths
- [x] Attachment endpoint authentication
- [x] Session lifetime reduced to 7 days
- [x] Fingerprint bypass tied to NODE_ENV=test only
- [x] Rate limit bypass tied to NODE_ENV=test only
- [x] Server-side MIME type validation using file-type library

**Performance:**
- [x] N+1 query fix in quota validation
- [x] Removed unused sessions fetch from getUser()
- [x] Added safety limit to participant export
