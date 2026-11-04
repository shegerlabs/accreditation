import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { createId as cuid } from '@paralleldrive/cuid2'
import {
	Action,
	AuditAction,
	AuditEntityType,
	RequestStatus,
} from '@prisma/client'
import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
	redirect,
} from '@remix-run/node'
import {
	Link,
	useActionData,
	useLoaderData,
	useSearchParams,
} from '@remix-run/react'
import { AlertCircle, CheckCircle, Eye, Info } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReactDOMServer from 'react-dom/server'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { DatePickerField } from '~/components/conform/DatePickerField'
import { CameraFileInputField } from '~/components/conform/CameraFileInputField'
import { FileInputField } from '~/components/conform/FileInputField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { RegistrationEmail } from '~/components/registration-confirmation'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Alert, AlertDescription } from '~/components/ui/alert'
import { Badge } from '~/components/ui/badge'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import {
	Card,
	CardContent,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { Progress } from '~/components/ui/progress'
import { Separator } from '~/components/ui/separator'
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '~/components/ui/tooltip'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { sendEmailAzure } from '~/utils/email.server'
import {
	validateDocumentFile,
	validatePhotoFile,
} from '~/utils/file-validation.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { getDomainUrl, invariantResponse, useIsPending } from '~/utils/misc'
import { createRegistrationCode } from '~/utils/registration.server'
import { uploadFile } from '~/utils/storage.server'
import { redirectWithToast } from '~/utils/toast.server'
import { useOptionalUser, userHasRole } from '~/utils/user'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { xssTransform } from '~/utils/validations'
import { processParticipant } from '~/utils/workflow.server'
import { FormCard } from '~/components/form-card'

// =============================================================================
// TYPE DEFINITIONS FOR RAW SQL QUERY RESULTS
// =============================================================================

/** Participant type reference (id + name only) */
interface ParticipantTypeRef {
	id: string
	name: string
}

/** Country reference for dropdowns */
interface CountryRef {
	id: string
	name: string
}

/** Meeting type reference for wishlist */
interface MeetingTypeRef {
	id: string
	name: string
}

/** Title reference for dropdowns */
interface TitleRef {
	id: string
	name: string
}

/** Participant registered under an invitation */
interface InvitationParticipant {
	organization: string
	participantType: ParticipantTypeRef
}

/** Quota constraint for an invitation - SOURCE OF TRUTH for quota management */
interface InvitationConstraintData {
	id: string
	participantTypeId: string
	accessLevel: string
	quota: number | null // null = unlimited
	participantType: ParticipantTypeRef
	participantCount: number // computed: how many registered for this type
}

/** Invitation with nested participants and constraints */
interface InvitationData {
	id: string
	organization: string
	email: string
	maximumQuota: number | null
	participants: InvitationParticipant[]
	invitationConstraints: InvitationConstraintData[]
	closedSessionCount: number
}

/** Validation flags from database checks */
interface ValidationData {
	event_exists: boolean
	tenant_exists: boolean
	event_tenant_match: boolean
}

/** Complete result from the master data query */
interface LoaderQueryResult {
	invitations: InvitationData[]
	participantTypes: ParticipantTypeRef[]
	countries: CountryRef[]
	meetingTypes: MeetingTypeRef[]
	titles: TitleRef[]
	validation: ValidationData
}

// Default max upload size - actual limit fetched from settings in loader
// This is used for client-side validation; server validates against actual setting
const DEFAULT_MAX_UPLOAD_SIZE_MB = 3
const MAX_UPLOAD_SIZE = 1024 * 1024 * DEFAULT_MAX_UPLOAD_SIZE_MB

const AttachmentFieldSetSchema = z
	.object({
		id: z.string().optional(),
		file: z
			.instanceof(File)
			.optional()
			.refine(file => !file || file.size <= MAX_UPLOAD_SIZE, {
				message: `File size must be less than ${DEFAULT_MAX_UPLOAD_SIZE_MB}MB`,
			}),
		altText: z.string().optional(),
		documentType: z.enum(['PASSPORT', 'PHOTO', 'LETTER']),
	})
	.superRefine((data, ctx) => {
		if (!data.file) return

		const isPhoto = data.documentType === 'PHOTO'
		const allowedTypes = isPhoto
			? ['image/png', 'image/jpeg']
			: ['image/png', 'image/jpeg', 'application/pdf']

		if (!allowedTypes.includes(data.file.type)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: isPhoto
					? 'Only PNG or JPG files are allowed for photos'
					: 'Only PNG, JPG, or PDF files are allowed',
				path: ['file'],
			})
		}
	})
	.refine(
		data => {
			return Boolean(data.id) || Boolean(data.file?.size)
		},
		{
			message: 'A file must be attached',
			path: ['file'],
		},
	)

type AttachmentFieldSet = z.infer<typeof AttachmentFieldSetSchema>

export function attachmentHasFile(
	attachment: AttachmentFieldSet,
): attachment is AttachmentFieldSet & {
	file: NonNullable<AttachmentFieldSet['file']>
} {
	return Boolean(attachment.file?.size && attachment.file.size > 0)
}

export function attachmentHasId(
	attachment: AttachmentFieldSet,
): attachment is AttachmentFieldSet & {
	id: NonNullable<AttachmentFieldSet['id']>
} {
	return attachment.id != null
}

export const ConsolidatedRegistrationSchema = z
	.object({
		// General Info
		tenantId: z.string({ required_error: 'Tenant is required' }),
		eventId: z.string({ required_error: 'Event is required' }),
		participantTypeId: z.string({
			required_error: 'Participant Type is required',
		}),
		invitationId: z.string().optional(),
		// requestFor field removed - focal users always use invitations, users don't
		gender: z.enum(['MALE', 'FEMALE']),
		titleId: z.string({ required_error: 'Title is required' }),
		firstName: z
			.string({ required_error: 'First Name is required' })
			.transform(xssTransform),
		familyName: z
			.string({ required_error: 'Family Name is required' })
			.transform(xssTransform),
		// IMPORTANT: Use .refine() instead of .max() for date comparisons.
		// .max(new Date()) is evaluated once at module load time (server startup),
		// causing stale date comparisons if the server runs for days/weeks.
		// .refine() evaluates the date at validation time (each request).
		dateOfBirth: z
			.date({ required_error: 'Date of Birth is required' })
			.refine((date) => date <= new Date(), {
				message: 'Date of Birth cannot be in the future',
			}),
		nationalityId: z.string({ required_error: 'Nationality is required' }),
		passportNumber: z
			.string({ required_error: 'Passport Number is required' })
			.regex(/^[a-zA-Z0-9- ]+$/, { message: 'Invalid passport number' })
			.transform(xssTransform)
			.transform(value => value?.replace(/[- ]/g, '') ?? '')
			.transform(value => value.toUpperCase()),
		// IMPORTANT: Use .refine() instead of .min() for date comparisons.
		// .min(new Date()) is evaluated once at module load time (server startup),
		// causing stale date comparisons if the server runs for days/weeks.
		// .refine() evaluates the date at validation time (each request).
		// Passport must be valid today or in the future (not expired).
		passportExpiry: z
			.date({ required_error: 'Passport Expiry is required' })
			.refine(
				(date) => {
					const today = new Date()
					today.setHours(0, 0, 0, 0)
					return date >= today
				},
				{ message: 'Passport must not be expired' },
			),

		// Professional Info
		organization: z
			.string({ required_error: 'Organization is required' })
			.transform(xssTransform),
		jobTitle: z
			.string({ required_error: 'Job Title is required' })
			.transform(xssTransform),
		countryId: z.string({ required_error: 'Country is required' }),
		city: z
			.string({ required_error: 'City is required' })
			.transform(xssTransform),
		// Email: optional for focal users (they often don't have participant emails)
		// Required for user role (validated in action's superRefine)
		email: z
			.string()
			.email({ message: 'Email is invalid' })
			.min(3, { message: 'Email is too short' })
			.max(100, { message: 'Email is too long' })
			.transform(value => value.toLowerCase())
			.transform(xssTransform)
			.optional()
			.or(z.literal('')),
		preferredLanguage: z.enum([
			'ENGLISH',
			'FRENCH',
			'PORTUGUESE',
			'ARABIC',
			'SWAHLI',
			'OTHER',
		]),

		// Wishlist
		needsVisa: z.boolean().default(false),
		needsCarPass: z.boolean().default(false),
		needsCarFromOrganizer: z.boolean().default(false),
		meetings: z.array(z.string()).optional(),

		// Documents
		documents: z.array(AttachmentFieldSetSchema),
	})
	.superRefine((data, ctx) => {
		// Note: Role-based validation (invitation required for focal, email required for users)
		// is handled in the action's async superRefine where we have access to user info

		// Validate all required documents are present
		const requiredTypes = ['PASSPORT', 'PHOTO', 'LETTER']
		const missingTypes = requiredTypes.filter(
			type =>
				!data.documents.some(
					doc =>
						doc.documentType === type &&
						(Boolean(doc.id) || Boolean(doc.file?.size)),
				),
		)

		if (missingTypes.length > 0) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `Missing required documents: ${missingTypes.join(', ')}`,
				path: ['documents'],
			})
		}
	})

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const url = new URL(request.url)
	const eventId = url.searchParams.get('eventId')
	const tenantId = url.searchParams.get('tenantId')
	if (!eventId || !tenantId) {
		return redirect('/events')
	}

	/**
	 * =============================================================================
	 * MASTER DATA QUERY - Fetches all registration form data in a single round-trip
	 * =============================================================================
	 *
	 * This query uses PostgreSQL CTEs (Common Table Expressions) to fetch:
	 * 1. User's invitations with nested participants and quota constraints
	 * 2. Count of participants in closed sessions (for quota checking)
	 * 3. Lookup data for form dropdowns (participant types, countries, meeting types)
	 * 4. Validation checks (event/tenant existence)
	 *
	 * WHY RAW SQL?
	 * - Single database round-trip instead of 6-8 separate Prisma queries
	 * - Complex nested JSON aggregation not easily achievable with Prisma
	 * - Computed fields (participantCount) calculated inline per constraint
	 *
	 * STRUCTURE:
	 * ┌─────────────────────────────────────────────────────────────────┐
	 * │ CTE 1: invitation_data                                         │
	 * │   └─> User's invitations with nested:                          │
	 * │       ├─> participants[] (who already registered)              │
	 * │       └─> invitationConstraints[] (quotas per participant type)│
	 * │           └─> participantCount (how many registered per type)  │
	 * │       └─> closedSessionCount (participants requesting closed)  │
	 * ├─────────────────────────────────────────────────────────────────┤
	 * │ CTE 2: lookup_data                                             │
	 * │   └─> Form dropdown options (participantTypes, countries, etc) │
	 * ├─────────────────────────────────────────────────────────────────┤
	 * │ CTE 3: validation_data                                         │
	 * │   └─> Security checks (event exists, tenant matches)           │
	 * └─────────────────────────────────────────────────────────────────┘
	 */
	const result = await prisma.$queryRaw`
		/*
		 * =========================================================================
		 * CTE 1: invitation_data
		 * =========================================================================
		 * Fetches all invitations for the current user for this event.
		 * Each invitation is transformed into a JSON object containing:
		 * - Basic invitation info (id, organization, email, maximumQuota)
		 * - Nested array of participants already registered under this invitation
		 * - Nested array of quota constraints with current usage counts
		 */
		WITH invitation_data AS (
			SELECT
				json_build_object(
					-- Basic invitation fields
					'id', i.id,
					'organization', i.organization,
					'email', i.email,
					'maximumQuota', i."maximumQuota",

					/*
					 * NESTED SUBQUERY: participants
					 * Returns array of participants already registered under this invitation.
					 * Used to:
					 * - Display who has already registered
					 * - Check against maximumQuota limit
					 */
					'participants', (
						SELECT COALESCE(json_agg(
							json_build_object(
								'organization', p.organization,
								'participantType', json_build_object('id', ppt.id, 'name', ppt.name)
							)
						), '[]'::json)  -- Return empty array if no participants
						FROM "Participant" p
						LEFT JOIN "ParticipantType" ppt ON p."participantTypeId" = ppt.id
						WHERE p."invitationId" = i.id
						AND p."tenantId" = ${tenantId}
						AND p."eventId" = ${eventId}
					),

					/*
					 * NESTED SUBQUERY: closedSessionCount
					 * Counts participants under this invitation who have requested Closed Session
					 * Uses the indexed attendClosedSession boolean field for performance
					 */
					'closedSessionCount', (
						SELECT CAST(COUNT(*) AS INTEGER)
						FROM "Participant" p
						WHERE p."invitationId" = i.id
						AND p."tenantId" = ${tenantId}
						AND p."eventId" = ${eventId}
						AND p."attendClosedSession" = true
						AND p."status" NOT IN ('REJECTED', 'CANCELLED')
					),

					/*
					 * ======================================================================
					 * NESTED SUBQUERY: invitationConstraints
					 * ======================================================================
					 * Returns array of quota constraints for this invitation.
					 * Each constraint defines:
					 * - Which participant type is allowed (or "Any" for all types)
					 * - What access level they get (CLOSED, OPEN, FREE, ALL)
					 * - Maximum quota (null = unlimited)
					 * - Current count of registered participants matching BOTH type AND access level
					 *
					 * This is the SOURCE OF TRUTH for quota management.
					 *
					 * ======================================================================
					 * PARTICIPANT COUNT LOGIC
					 * ======================================================================
					 *
					 * The participantCount for each constraint is calculated based on
					 * TWO dimensions:
					 *
					 * ┌─────────────────────────────────────────────────────────────────┐
					 * │ 1. ParticipantType dimension:                                   │
					 * │    - "Any": count ALL participants (regardless of their type)   │
					 * │    - Specific type: count only that type's participants         │
					 * │                                                                 │
					 * │ 2. AccessLevel dimension:                                       │
					 * │    - CLOSED: count those who selected Closed Session in wishlist│
					 * │    - OPEN/FREE/ALL: count those who did NOT select Closed Session│
					 * └─────────────────────────────────────────────────────────────────┘
					 *
					 * ======================================================================
					 * EXAMPLES: How participantCount is calculated
					 * ======================================================================
					 *
					 * Given these registered participants:
					 *   • Participant A: Delegate, wishList includes "Closed Session"
					 *   • Participant B: Delegate, wishList does NOT include "Closed Session"
					 *   • Participant C: Press, wishList includes "Closed Session"
					 *   • Participant D: Press, wishList does NOT include "Closed Session"
					 *   • Participant E: Observer, wishList does NOT include "Closed Session"
					 *
					 * ┌─────────────────────┬─────────────┬───────────────────────────────┐
					 * │ Constraint          │ Count       │ Which participants counted?   │
					 * ├─────────────────────┼─────────────┼───────────────────────────────┤
					 * │ Any, CLOSED         │ 2           │ A + C (both have Closed)      │
					 * │ Any, OPEN           │ 3           │ B + D + E (no Closed)         │
					 * │ Delegate, CLOSED    │ 1           │ A only (Delegate + Closed)    │
					 * │ Delegate, OPEN      │ 1           │ B only (Delegate, no Closed)  │
					 * │ Press, CLOSED       │ 1           │ C only (Press + Closed)       │
					 * │ Press, OPEN         │ 1           │ D only (Press, no Closed)     │
					 * │ Observer, CLOSED    │ 0           │ None (no Observer + Closed)   │
					 * │ Observer, OPEN      │ 1           │ E only (Observer, no Closed)  │
					 * └─────────────────────┴─────────────┴───────────────────────────────┘
					 *
					 * KEY INSIGHT:
					 * - "Any" counts across ALL participant types
					 * - Specific type counts only that type
					 * - CLOSED counts only those with Closed Session in wishlist
					 * - OPEN counts only those WITHOUT Closed Session in wishlist
					 * ======================================================================
					 */
					'invitationConstraints', (
						SELECT COALESCE(json_agg(
							json_build_object(
								'id', ic.id,
								'participantTypeId', ic."participantTypeId",
								'accessLevel', ic."accessLevel",
								'quota', ic.quota,  -- null means unlimited
								'participantType', json_build_object(
									'id', icpt.id,
									'name', icpt.name
								),
								'participantCount', CASE
									-- For "Any" participant type: use total counts (all types)
									WHEN icpt.name = 'Any' THEN
										CASE
											WHEN ic."accessLevel" = 'CLOSED' THEN COALESCE(tc."closedCount", 0)
											ELSE COALESCE(tc."openCount", 0)
										END
									-- For specific participant type: use type-specific counts
									ELSE
										CASE
											WHEN ic."accessLevel" = 'CLOSED' THEN COALESCE(pc."closedCount", 0)
											ELSE COALESCE(pc."openCount", 0)
										END
								END
							)
						), '[]'::json)  -- Return empty array if no constraints
						FROM "InvitationConstraint" ic
						LEFT JOIN "ParticipantType" icpt ON ic."participantTypeId" = icpt.id
						/*
						 * Pre-aggregated participant counts per (invitation, participantType)
						 * Split by access level using the indexed attendClosedSession boolean
						 */
						LEFT JOIN (
							SELECT
								p."invitationId",
								p."participantTypeId",
								COUNT(*) FILTER (WHERE p."attendClosedSession" = true)::integer as "closedCount",
								COUNT(*) FILTER (WHERE p."attendClosedSession" = false)::integer as "openCount"
							FROM "Participant" p
							WHERE p."tenantId" = ${tenantId}
							AND p."eventId" = ${eventId}
							AND p."status" NOT IN ('REJECTED', 'CANCELLED')
							GROUP BY p."invitationId", p."participantTypeId"
						) pc ON pc."invitationId" = i.id AND pc."participantTypeId" = ic."participantTypeId"
						/*
						 * Total counts per invitation (for "Any" participant type constraints)
						 * Counts ALL participants regardless of their participant type
						 * Uses the indexed attendClosedSession boolean for performance
						 */
						LEFT JOIN (
							SELECT
								p."invitationId",
								COUNT(*) FILTER (WHERE p."attendClosedSession" = true)::integer as "closedCount",
								COUNT(*) FILTER (WHERE p."attendClosedSession" = false)::integer as "openCount"
							FROM "Participant" p
							WHERE p."tenantId" = ${tenantId}
							AND p."eventId" = ${eventId}
							AND p."status" NOT IN ('REJECTED', 'CANCELLED')
							GROUP BY p."invitationId"
						) tc ON tc."invitationId" = i.id
						WHERE ic."invitationId" = i.id
					)
				) as invitation_json
			FROM "Invitation" i
			WHERE i."tenantId" = ${tenantId}
			AND i."eventId" = ${eventId}
			AND i.email = ${user.email}
			/*
			 * ORDER BY: Show invitations with most participants first,
			 * then alphabetically by organization name.
			 * This puts the most active invitations at the top.
			 */
			ORDER BY (
				SELECT COUNT(*)
				FROM "Participant" p
				WHERE p."invitationId" = i.id
			) DESC,
			i.organization ASC
		),

		/*
		 * =========================================================================
		 * CTE 2: lookup_data
		 * =========================================================================
		 * Fetches static reference data for form dropdowns.
		 * All returned as JSON arrays for direct use in the frontend.
		 */
		lookup_data AS (
			SELECT
				-- All participant types (for type selection dropdown)
				COALESCE((SELECT json_agg(json_build_object('id', pt.id, 'name', pt.name)) FROM "ParticipantType" pt), '[]'::json) as "participantTypes",

				-- All countries sorted alphabetically (for nationality/country dropdowns)
				COALESCE((SELECT json_agg(json_build_object('id', c.id, 'name', c.name) ORDER BY c.name ASC) FROM "Country" c), '[]'::json) as countries,

				-- Meeting types for this tenant (for wishlist checkboxes)
				COALESCE((SELECT json_agg(json_build_object('id', mt.id, 'name', mt.name)) FROM "MeetingType" mt WHERE mt."tenantId" = ${tenantId}), '[]'::json) as "meetingTypes",

				-- All titles sorted alphabetically (for title dropdown)
				COALESCE((SELECT json_agg(json_build_object('id', t.id, 'name', t.name) ORDER BY t.name ASC) FROM "Title" t), '[]'::json) as titles
		),

		/*
		 * =========================================================================
		 * CTE 3: validation_data
		 * =========================================================================
		 * Security validation checks performed at the database level.
		 * Returns boolean flags that are checked after query execution.
		 */
		validation_data AS (
			SELECT
				-- Check if the requested event exists
				(SELECT e.id IS NOT NULL FROM "Event" e WHERE e.id = ${eventId}) as event_exists,

				-- Check if the requested tenant exists
				(SELECT t.id IS NOT NULL FROM "Tenant" t WHERE t.id = ${tenantId}) as tenant_exists,

				-- Check if the event belongs to the tenant (prevents cross-tenant access)
				(SELECT e."tenantId" = ${tenantId} FROM "Event" e WHERE e.id = ${eventId}) as event_tenant_match
		)

		/*
		 * =========================================================================
		 * FINAL SELECT: Combine all CTEs into a single result row
		 * =========================================================================
		 */
		SELECT
			-- Aggregate all invitation JSON objects into an array
			COALESCE((SELECT json_agg(invitation_json) FROM invitation_data), '[]'::json) as invitations,

			-- Lookup data for form dropdowns
			l."participantTypes",
			l.countries,
			l."meetingTypes",
			l.titles,

			-- Validation results as JSON object
			(SELECT row_to_json(validation_data) FROM validation_data) as validation
		FROM lookup_data l;
	`

	const data = (result as LoaderQueryResult[])[0]

	invariantResponse(data.validation.event_exists, 'Event not found', {
		status: 404,
	})
	invariantResponse(data.validation.tenant_exists, 'Tenant not found', {
		status: 404,
	})
	invariantResponse(data.validation.event_tenant_match, 'Invalid request', {
		status: 400,
	})

	// Check if user already registered for this event (by userId, not email)
	const existingParticipant = await prisma.participant.findFirst({
		where: {
			tenantId,
			eventId,
			userId: user.id,
		},
		select: { id: true },
	})

	// Check if user has focal role
	const userWithRoles = await prisma.user.findUnique({
		where: { id: user.id },
		select: {
			roles: {
				select: { name: true },
			},
		},
	})
	const isFocal = userWithRoles?.roles.some(r => r.name === 'focal') ?? false

	// Fetch max upload size from settings
	const maxUploadSizeMB = await getSetting<number>(
		SettingKeys.UPLOAD_MAX_IMAGE_SIZE_MB,
	)

	return json({
		invitations: data.invitations,
		participantTypes: data.participantTypes,
		countries: data.countries,
		meetingTypes: data.meetingTypes,
		titles: data.titles,
		userEmail: user.email,
		existingParticipant: existingParticipant?.id ?? null,
		isFocal,
		maxUploadSizeMB,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['user', 'focal'])

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	// Check if user is focal
	const userWithRoles = await prisma.user.findUnique({
		where: { id: user.id },
		select: { roles: { select: { name: true } } },
	})
	const isFocal = userWithRoles?.roles.some(r => r.name === 'focal') ?? false

	const submission = await parseWithZod(formData, {
		schema: ConsolidatedRegistrationSchema.superRefine(async (data, ctx) => {
			// =================================================================
			// ROLE-BASED VALIDATION
			// =================================================================

			// 1. Focal users MUST select an invitation
			if (isFocal && !data.invitationId) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'Select an invitation',
					path: ['invitationId'],
				})
				return
			}

			// 2. User role: email required and must match logged-in user
			if (!isFocal) {
				if (!data.email) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Email is required',
						path: ['email'],
					})
					return
				}
				if (data.email.toLowerCase() !== user.email.toLowerCase()) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Email must match your account',
						path: ['email'],
					})
					return
				}
				// Check if user already registered for this event (by userId)
				const existingRegistration = await prisma.participant.findFirst({
					where: {
						eventId: data.eventId,
						tenantId: data.tenantId,
						userId: user.id,
					},
					select: { id: true },
				})
				if (existingRegistration) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'You are already registered for this event.',
					})
					return
				}
			}

			// 3. Passport uniqueness (enforced for both roles)
			const participantWithPassport = await prisma.participant.findFirst({
				where: {
					tenantId: data.tenantId,
					eventId: data.eventId,
					passportNumber: data.passportNumber,
					status: { notIn: ['REJECTED', 'CANCELLED'] },
				},
				select: { id: true },
			})

			if (participantWithPassport) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					message: 'A participant with this passport number already exists.',
					path: ['passportNumber'],
				})
				return
			}

			// 4. Email uniqueness for focal (only if email is provided)
			if (isFocal && data.email) {
				const existingWithEmail = await prisma.participant.findFirst({
					where: {
						tenantId: data.tenantId,
						eventId: data.eventId,
						email: data.email,
					},
				})

				if (existingWithEmail) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'A participant with this email already exists',
						path: ['email'],
					})
					return
				}
			}

			/*
			 * =================================================================
			 * QUOTA VALIDATION - TWO-DIMENSIONAL MODEL
			 * =================================================================
			 * For focal users with invitation, validate quota based on:
			 * 1. Invitation.maximumQuota (absolute ceiling)
			 * 2. Constraint buckets (ParticipantType x AccessLevel)
			 *
			 * A registration is allowed if:
			 * - Total participants < maximumQuota (if set)
			 * - At least ONE applicable constraint has available quota
			 *
			 * Applicable constraints:
			 * - "Any" constraints (participantType.name = 'Any')
			 * - Specific constraints matching the selected participantTypeId
			 *
			 * AccessLevel consideration:
			 * - If participant selects Closed Session → match CLOSED constraints
			 * - Otherwise → match OPEN/FREE/ALL constraints
			 * =================================================================
			 */
			if (isFocal && data.invitationId) {
				// Fetch invitation with ALL constraints (not just for this type)
				const invitation = await prisma.invitation.findUnique({
					where: { id: data.invitationId },
					select: {
						id: true,
						maximumQuota: true,
						invitationConstraints: {
							select: {
								id: true,
								quota: true,
								accessLevel: true,
								participantTypeId: true,
								participantType: { select: { id: true, name: true } },
							},
						},
					},
				})

				if (!invitation) {
					ctx.addIssue({
						code: z.ZodIssueCode.custom,
						message: 'Invalid invitation selected.',
						path: ['invitationId'],
					})
					return
				}

				// CHECK 1: Invitation's overall maximum quota (absolute ceiling)
				// Excludes REJECTED and CANCELLED participants from count
				if (invitation.maximumQuota !== null) {
					const activeParticipantCount = await prisma.participant.count({
						where: {
							invitationId: data.invitationId,
							status: { notIn: ['REJECTED', 'CANCELLED'] },
						},
					})
					if (activeParticipantCount >= invitation.maximumQuota) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: `This invitation has reached its maximum quota of ${invitation.maximumQuota} participants.`,
							path: ['invitationId'],
						})
						return
					}
				}

				// CHECK 2: Constraint-based quota validation
				if (invitation.invitationConstraints.length > 0) {
					// Find all applicable constraints for this participant type
					// (includes "Any" constraints + specific type constraints)
					const applicableConstraints = invitation.invitationConstraints.filter(
						ic =>
							ic.participantType?.name === 'Any' ||
							ic.participantTypeId === data.participantTypeId,
					)

					// If no applicable constraints, check if ANY constraints exist
					if (applicableConstraints.length === 0) {
						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message:
								'This participant type is not allowed for the selected invitation.',
							path: ['participantTypeId'],
						})
						return
					}

					// Determine if participant is requesting Closed Session
					// (based on wishlist/meetings selection)
					const isRequestingClosed =
						data.meetings &&
						(await prisma.meetingType.findFirst({
							where: {
								tenantId: data.tenantId,
								name: 'Closed Session',
								id: { in: data.meetings },
							},
						})) !== null

					// Check if at least ONE applicable constraint has available quota
					let hasAvailableQuota = false

					// Batch fetch ALL participant counts in a single query (eliminates N+1)
					// Groups by participantTypeId and attendClosedSession for efficient lookup
					// Excludes REJECTED and CANCELLED participants from quota counts
					const participantCounts = await prisma.participant.groupBy({
						by: ['participantTypeId', 'attendClosedSession'],
						where: {
							invitationId: data.invitationId,
							tenantId: data.tenantId,
							eventId: data.eventId,
							status: { notIn: ['REJECTED', 'CANCELLED'] },
						},
						_count: { id: true },
					})

					// Build lookup maps for O(1) access
					const countMap = new Map<string, number>()
					let totalClosedCount = 0
					let totalOpenCount = 0

					for (const group of participantCounts) {
						const key = `${group.participantTypeId}:${group.attendClosedSession}`
						countMap.set(key, group._count.id)
						if (group.attendClosedSession) {
							totalClosedCount += group._count.id
						} else {
							totalOpenCount += group._count.id
						}
					}

					// Helper to get count (replaces individual prisma.participant.count calls)
					const getCount = (typeId: string | null, isClosed: boolean): number => {
						if (typeId === null) return isClosed ? totalClosedCount : totalOpenCount
						return countMap.get(`${typeId}:${isClosed}`) ?? 0
					}

					for (const constraint of applicableConstraints) {
						// If quota is unlimited, this constraint has space
						if (constraint.quota === null) {
							hasAvailableQuota = true
							break
						}

						// Determine if this constraint matches the access level request
						const isClosedConstraint = constraint.accessLevel === 'CLOSED'
						const constraintMatchesRequest =
							(isRequestingClosed && isClosedConstraint) ||
							(!isRequestingClosed && !isClosedConstraint)

						// Count participants matching this constraint using pre-fetched data
						// For "Any" type: count all participants with matching access level
						// For specific type: count that type with matching access level
						const isAnyType = constraint.participantType?.name === 'Any'
						const currentCount = getCount(
							isAnyType ? null : data.participantTypeId,
							isClosedConstraint,
						)

						// Check if this constraint has available quota
						if (currentCount < constraint.quota) {
							// Only count as available if it matches the access level request
							if (constraintMatchesRequest) {
								hasAvailableQuota = true
								break
							}
						}
					}

					if (!hasAvailableQuota) {
						// Get participant type name for error message
						const participantType = await prisma.participantType.findUnique({
							where: { id: data.participantTypeId },
							select: { name: true },
						})

						ctx.addIssue({
							code: z.ZodIssueCode.custom,
							message: `No available quota for ${participantType?.name || 'this participant type'}. All applicable constraint buckets are full.`,
							path: ['participantTypeId'],
						})
						return
					}
				}
				// If no constraints at all, allow any participant type (no restrictions)
			}
		}).transform(async ({ documents = [], ...data }) => {
			// Process and validate updated documents
			const updatedDocuments = await Promise.all(
				documents.filter(attachmentHasId).map(async i => {
					if (attachmentHasFile(i)) {
						const blob = Buffer.from(await i.file.arrayBuffer())

						// Server-side file type validation
						const isPhoto = i.documentType === 'PHOTO'
						const validation = isPhoto
							? await validatePhotoFile(blob, i.file.type)
							: await validateDocumentFile(blob, i.file.type)

						if (!validation.valid) {
							throw new Error(validation.error || 'Invalid file type')
						}

						return {
							id: i.id,
							altText: i.altText,
							contentType: i.file.type,
							blob,
							fileName: cuid(),
							extension: i.file.name.split('.').pop() ?? '',
						}
					} else {
						return { id: i.id }
					}
				}),
			)

			// Process and validate new documents
			const newDocuments = await Promise.all(
				documents
					.filter(attachmentHasFile)
					.filter(image => !image.id)
					.map(async image => {
						const blob = Buffer.from(await image.file.arrayBuffer())

						// Server-side file type validation
						const isPhoto = image.documentType === 'PHOTO'
						const validation = isPhoto
							? await validatePhotoFile(blob, image.file.type)
							: await validateDocumentFile(blob, image.file.type)

						if (!validation.valid) {
							throw new Error(validation.error || 'Invalid file type')
						}

						const extension = image.file.name.split('.').pop() ?? ''
						return {
							altText: `${image.file.name}`,
							contentType: image.file.type,
							documentType: image.documentType,
							blob,
							fileName: cuid(),
							extension,
						}
					}),
			)

			return {
				...data,
				updatedDocuments,
				newDocuments,
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

	const { updatedDocuments, newDocuments, ...formValues } = submission.value

	// Get invitation organization
	const invitationOrganization = formValues.invitationId
		? (
				await prisma.invitation.findUnique({
					where: { id: formValues.invitationId },
				})
			)?.organization
		: undefined

	// Get the first step of the workflow for this event + participant type
	const firstStep = await prisma.step.findFirst({
		where: {
			workflow: {
				tenantId: formValues.tenantId,
				eventId: formValues.eventId,
				participantTypeId: formValues.participantTypeId,
			},
			order: 1,
		},
	})

	if (!firstStep) {
		return json(
			{
				result: submission.reply({
					formErrors: [
						'No workflow configured for this event and participant type. Please contact an administrator.',
					],
				}),
			},
			{ status: 400 },
		)
	}

	// Generate registration code
	let attempts = 0
	const MAX_ATTEMPTS = 5
	let generatedCode: string | null = null

	while (!generatedCode && attempts < MAX_ATTEMPTS) {
		try {
			generatedCode = await createRegistrationCode(
				formValues.eventId,
				formValues.participantTypeId,
			)

			const existing = await prisma.participant.findUnique({
				where: { registrationCode: generatedCode },
				select: { id: true },
			})

			if (existing) {
				generatedCode = null
				attempts++
			}
		} catch (error) {
			attempts++
			invariantResponse(
				attempts < MAX_ATTEMPTS,
				'Could not generate unique registration code',
				{ status: 500 },
			)
		}
	}

	invariantResponse(
		generatedCode,
		'Could not generate unique registration code',
	)
	const registrationCode = generatedCode

	// Determine if participant is requesting Closed Session (for attendClosedSession field)
	const closedSessionMeetingType = formValues.meetings
		? await prisma.meetingType.findFirst({
				where: {
					tenantId: formValues.tenantId,
					name: 'Closed Session',
					id: { in: formValues.meetings },
				},
				select: { id: true },
			})
		: null
	const attendClosedSession = closedSessionMeetingType !== null

	// Determine if participant is requesting Executive Council Closed Session
	const executiveCouncilClosedSessionMeetingType = formValues.meetings
		? await prisma.meetingType.findFirst({
				where: {
					tenantId: formValues.tenantId,
					name: 'Executive Council Closed Session',
					id: { in: formValues.meetings },
				},
				select: { id: true },
			})
		: null
	const attendExecutiveCouncilClosedSession =
		executiveCouncilClosedSessionMeetingType !== null

	// Create participant
	const participant = await prisma.participant.create({
		select: { id: true, email: true, firstName: true, familyName: true },
		data: {
			userId: user.id,
			tenantId: formValues.tenantId,
			eventId: formValues.eventId,
			participantTypeId: formValues.participantTypeId,
			invitationId: formValues.invitationId ?? null,
			gender: formValues.gender,
			titleId: formValues.titleId,
			firstName: formValues.firstName!,
			familyName: formValues.familyName!,
			dateOfBirth: formValues.dateOfBirth,
			nationalityId: formValues.nationalityId,
			passportNumber: formValues.passportNumber,
			passportExpiry: formValues.passportExpiry,
			// For user role (not focal), use logged-in user's email
			// For focal role, use provided email or null (null won't trigger unique constraint)
			email: isFocal ? formValues.email || null : user.email,
			organization: invitationOrganization ?? formValues.organization!,
			jobTitle: formValues.jobTitle!,
			countryId: formValues.countryId,
			city: formValues.city!,
			preferredLanguage: formValues.preferredLanguage,
			needsVisa: formValues.needsVisa,
			needsCarPass: formValues.needsCarPass,
			needsCarFromOrganizer: formValues.needsCarFromOrganizer,
			wishList: formValues.meetings?.join(',') ?? null,
			attendClosedSession,
			attendExecutiveCouncilClosedSession,
			stepId: firstStep.id,
			status: RequestStatus.PENDING,
			registrationCode,
			documents: {
				create: newDocuments.map(({ blob, ...attachment }) => attachment),
			},
		},
	})

	invariantResponse(participant.id, 'Could not create participant')

	// Audit log for participant registration
	await auditRequest({
		request,
		action: AuditAction.CREATE,
		entityType: AuditEntityType.PARTICIPANT,
		entityId: participant.id,
		description: `Participant ${participant.firstName} ${participant.familyName} registered for event`,
		userId: user.id,
		tenantId: formValues.tenantId,
		metadata: {
			registrationCode,
			participantTypeId: formValues.participantTypeId,
			eventId: formValues.eventId,
			invitationId: formValues.invitationId,
			isFocal,
		},
	})

	// Send confirmation email only if participant has an email
	// (focal users may register participants without email addresses)
	if (participant.email) {
		const domainUrl = getDomainUrl(request)
		const lookupUrl = `${domainUrl}/requests/${participant.id}`

		const event = await prisma.event.findFirst({
			where: { status: 'PUBLISHED' },
			select: { name: true },
		})
		invariantResponse(event, 'Event not found', { status: 404 })

		void sendEmailAzure({
			to: participant.email,
			subject: 'Event Registration Code',
			plainText: `Your registration code is: ${registrationCode}`,
			html: ReactDOMServer.renderToString(
				<RegistrationEmail
					participantName={`${participant.firstName} ${participant.familyName}`}
					registrationCode={registrationCode}
					eventName={event.name}
					lookupUrl={lookupUrl}
				/>,
			),
		})
	}

	// Process through workflow
	await processParticipant(
		participant.id,
		user.id,
		Action.APPROVE,
		'Initial Request Received',
	)

	await processParticipant(
		participant.id,
		user.id,
		Action.APPROVE,
		'Initial Request Reviewed',
	)

	// Upload documents to Azure
	const newAttachmentsPromises = newDocuments.map(attachment =>
		uploadFile({
			containerName: 'accreditation',
			directory: `participants/${participant.id}`,
			fileName: attachment.fileName,
			extension: attachment.extension,
			blob: attachment.blob,
		}),
	)

	await Promise.all(newAttachmentsPromises)

	return redirectWithToast(`/requests/${participant.id}`, {
		type: 'success',
		title: `Participant Registered`,
		description: `Registration successful. Your registration code is ${registrationCode}`,
	})
}

// =============================================================================
// DOCUMENT UPLOAD FIELD COMPONENT
// =============================================================================
// This component MUST be defined outside the main component to prevent
// re-creation on every render, which would lose file input state.

function DocumentUploadField({
	documentFields,
	documentType,
}: {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	documentFields: any
	documentType: string
}) {
	const isPhoto = documentType === 'PHOTO'
	const [previewFile, setPreviewFile] = useState<File | null>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const [showPreview, setShowPreview] = useState(false)
	const fileInputRef = useRef<HTMLDivElement>(null)

	// Function to crop and resize image to 35x45mm (413x531px at 300 DPI)
	const cropImageTo35x45mm = (file: File): Promise<File> => {
		return new Promise((resolve, reject) => {
			// Validate file type first
			if (!file.type.startsWith('image/')) {
				reject(
					new Error(
						`Invalid file type: ${file.type}. Expected an image file.`,
					),
				)
				return
			}

			// Check file size
			if (file.size === 0) {
				reject(new Error('File is empty'))
				return
			}

			// Use FileReader to load the image as data URL (more reliable than object URL)
			const reader = new FileReader()
			let isResolved = false

			reader.onload = e => {
				if (isResolved) return

				const dataUrl = e.target?.result as string
				if (!dataUrl) {
					isResolved = true
					reject(new Error('Failed to read file as data URL'))
					return
				}

				const img = new Image()

				img.onload = () => {
					if (isResolved) return

					try {
						// Validate image loaded successfully
						if (img.width === 0 || img.height === 0) {
							isResolved = true
							reject(new Error('Invalid image dimensions'))
							return
						}

						// Target dimensions: 35x45mm at 300 DPI = 413x531 pixels
						const targetWidth = 413
						const targetHeight = 531
						const targetAspect = targetWidth / targetHeight // 0.778

						const canvas = document.createElement('canvas')
						canvas.width = targetWidth
						canvas.height = targetHeight
						const ctx = canvas.getContext('2d')
						if (!ctx) {
							isResolved = true
							reject(new Error('Could not get canvas context'))
							return
						}

						// Calculate crop to maintain 35x45mm aspect ratio
						const sourceAspect = img.width / img.height
						let sx = 0
						let sy = 0
						let sw = img.width
						let sh = img.height

						if (sourceAspect > targetAspect) {
							// Image is wider, crop horizontally (center crop)
							sw = img.height * targetAspect
							sx = (img.width - sw) / 2
						} else {
							// Image is taller, crop vertically (center crop)
							sh = img.width / targetAspect
							sy = (img.height - sh) / 2
						}

						// Draw cropped and scaled image to exact 35x45mm dimensions
						ctx.drawImage(
							img,
							sx,
							sy,
							sw,
							sh,
							0,
							0,
							targetWidth,
							targetHeight,
						)

						// Verify canvas dimensions
						console.log(
							'Canvas dimensions:',
							canvas.width,
							'x',
							canvas.height,
						)
						console.log(
							'Source image dimensions:',
							img.width,
							'x',
							img.height,
						)
						console.log('Crop area:', sx, sy, sw, sh)

						canvas.toBlob(
							blob => {
								if (isResolved) return
								isResolved = true

								if (blob) {
									const croppedFile = new File(
										[blob],
										file.name.replace(/\.[^/.]+$/, '.jpg'),
										{
											type: 'image/jpeg',
											lastModified: Date.now(),
										},
									)
									console.log(
										'Cropped file created, size:',
										croppedFile.size,
										'bytes',
									)
									resolve(croppedFile)
								} else {
									reject(new Error('Failed to create blob from canvas'))
								}
							},
							'image/jpeg',
							0.9,
						)
					} catch (error) {
						if (isResolved) return
						isResolved = true
						console.error('Error in image processing:', error)
						reject(error instanceof Error ? error : new Error(String(error)))
					}
				}

				img.onerror = error => {
					if (isResolved) return
					isResolved = true

					console.error('Image load error:', error)
					console.error('File details:', {
						name: file.name,
						type: file.type,
						size: file.size,
					})
					reject(
						new Error(
							`Failed to load image from data URL. File type: ${file.type}, Size: ${file.size} bytes`,
						),
					)
				}

				// Load image from data URL
				img.src = dataUrl
			}

			reader.onerror = () => {
				if (isResolved) return
				isResolved = true

				console.error('FileReader error:', reader.error)
				reject(
					new Error(
						`Failed to read file: ${reader.error?.message || 'Unknown error'}`,
					),
				)
			}

			// Read file as data URL
			reader.readAsDataURL(file)
		})
	}

	// Set up file change listener for preview and auto-crop
	useEffect(() => {
		if (!isPhoto) return

		let input: HTMLInputElement | null = null
		let isProcessing = false
		let cleanup: (() => void) | null = null

		const findAndSetupInput = () => {
			input = fileInputRef.current?.querySelector(
				'input[type="file"]',
			) as HTMLInputElement
			if (!input) return

			const handleChange = async (e: Event) => {
				// Prevent infinite loop if we're already processing
				if (isProcessing) return

				const target = e.target as HTMLInputElement
				const file = target.files?.[0]

				if (!file || !file.type.startsWith('image/')) {
					setPreviewFile(null)
					setPreviewUrl(null)
					return
				}

				isProcessing = true
				try {
					console.log(
						'Original file selected:',
						file.name,
						file.size,
						'bytes',
						file.type,
					)

					// Automatically crop to 35x45mm
					const croppedFile = await cropImageTo35x45mm(file)

					console.log(
						'Cropped file created:',
						croppedFile.name,
						croppedFile.size,
						'bytes',
					)

					// Replace the file in the input
					if (!input) {
						throw new Error('Input element not found')
					}
					const dataTransfer = new DataTransfer()
					dataTransfer.items.add(croppedFile)
					input.files = dataTransfer.files

					// Set preview from cropped file
					setPreviewFile(croppedFile)
					const reader = new FileReader()
					reader.onloadend = () => {
						const result = reader.result as string
						setPreviewUrl(result)

						// Verify the image dimensions
						const img = new Image()
						img.onload = () => {
							console.log(
								'Preview image actual dimensions:',
								img.naturalWidth,
								'x',
								img.naturalHeight,
							)
							if (img.naturalWidth !== 413 || img.naturalHeight !== 531) {
								console.warn(
									'Image dimensions do not match expected 413x531px!',
								)
							}
						}
						img.src = result

						isProcessing = false
					}
					reader.onerror = () => {
						console.error('FileReader error')
						isProcessing = false
					}
					reader.readAsDataURL(croppedFile)

					// Trigger change event for Conform AFTER setting preview
					const currentInputForEvent = input
					if (currentInputForEvent) {
						setTimeout(() => {
							const changeEvent = new Event('change', { bubbles: true })
							currentInputForEvent.dispatchEvent(changeEvent)
						}, 100)
					}
				} catch (error) {
					console.error('Error cropping image:', error)
					console.error('Error details:', {
						message: error instanceof Error ? error.message : String(error),
						stack: error instanceof Error ? error.stack : undefined,
					})
					alert(
						`Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again.`,
					)
					// Reset input on error
					const currentInput = fileInputRef.current?.querySelector(
						'input[type="file"]',
					) as HTMLInputElement
					if (currentInput) {
						currentInput.value = ''
					}
					setPreviewFile(null)
					setPreviewUrl(null)
					isProcessing = false
				}
			}

			input.addEventListener('change', handleChange)
			cleanup = () => {
				input?.removeEventListener('change', handleChange)
			}
		}

		// Try to find input immediately
		findAndSetupInput()

		// If not found, try again after a short delay
		if (!input) {
			const timeout = setTimeout(() => {
				findAndSetupInput()
			}, 100)
			return () => {
				clearTimeout(timeout)
				cleanup?.()
			}
		}

		return cleanup || undefined
	}, [isPhoto])

	// Get tooltip hint based on document type
	const getDocumentHint = () => {
		if (isPhoto) {
			return 'JPG or PNG format • Max size: 2MB • Auto-cropped to 35×45mm'
		} else if (documentType === 'PASSPORT') {
			return 'JPG, PNG, or PDF format • Max size: 2MB • Ensure all details are visible'
		} else {
			return 'JPG, PNG, or PDF format • Max size: 2MB • Include stamps and signatures'
		}
	}

	return (
		<>
			<div className="mb-4">
				<div className="w-full">
					<InputField meta={documentFields.id} type="hidden" />
					<InputField meta={documentFields.documentType} type="hidden" />

					<Field>
						<div className="mb-2 flex items-center gap-2">
							<Label htmlFor={documentFields.file.id}>
								{documentFields.documentType.initialValue}
							</Label>
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<Info className="h-4 w-4 cursor-help text-muted-foreground" />
									</TooltipTrigger>
									<TooltipContent>
										<p>{getDocumentHint()}</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						</div>
						<div className="flex gap-2">
							<div className="flex-1" ref={fileInputRef}>
								{isPhoto ? (
									<CameraFileInputField
										meta={documentFields.file}
										autoComplete="off"
										accept=".png,.jpg,.jpeg"
									/>
								) : (
									<FileInputField
										meta={documentFields.file}
										autoComplete="off"
										accept=".png,.jpg,.jpeg,.pdf"
									/>
								)}
							</div>
							{isPhoto && previewFile && previewUrl && (
								<Button
									type="button"
									variant="outline"
									onClick={() => setShowPreview(true)}
									className="shrink-0"
									title="Preview uploaded photo"
								>
									<Eye className="h-4 w-4" />
								</Button>
							)}
						</div>

						{documentFields.file.errors && (
							<FieldError>{documentFields.file.errors}</FieldError>
						)}
					</Field>
				</div>
			</div>

			{isPhoto && (
				<Dialog open={showPreview} onOpenChange={setShowPreview}>
					<DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
						<DialogHeader>
							<DialogTitle>Photo Preview</DialogTitle>
						</DialogHeader>
						<div className="mt-4">
							{previewUrl && (
								<div className="flex flex-col items-center gap-4">
									<img
										src={previewUrl}
										alt="Preview"
										className="rounded-lg border"
										style={{
											width: '413px',
											height: '531px',
											objectFit: 'contain',
										}}
										onLoad={e => {
											const img = e.target as HTMLImageElement
											console.log(
												'Preview image dimensions:',
												img.naturalWidth,
												'x',
												img.naturalHeight,
											)
										}}
									/>
									<p className="text-sm text-muted-foreground">
										Dimensions: 35x45mm (413x531px at 300 DPI)
									</p>
								</div>
							)}
						</div>
					</DialogContent>
				</Dialog>
			)}
		</>
	)
}

export default function NewParticipantRoute() {
	const [searchParams] = useSearchParams()
	const {
		invitations,
		participantTypes,
		countries,
		meetingTypes,
		titles,
		userEmail,
		existingParticipant,
		isFocal,
	} = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const user = useOptionalUser()
	const isPending = useIsPending()
	// User role: can only register once (blocked if existingParticipant exists)
	// Focal role: can register multiple participants (not blocked by existingParticipant)
	const canRegister = !existingParticipant || isFocal

	const [form, fields] = useForm({
		id: 'consolidated-registration',
		constraint: getZodConstraint(ConsolidatedRegistrationSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ConsolidatedRegistrationSchema })
		},
		shouldValidate: 'onInput',
		shouldRevalidate: 'onInput',
		defaultValue: {
			tenantId: searchParams.get('tenantId') ?? '',
			eventId: searchParams.get('eventId') ?? '',
			// Focal users: email is optional, starts empty
			// User role: pre-fill with logged-in user's email
			email: isFocal ? '' : userEmail,
			invitationId: invitations.length === 1 ? invitations[0].id : '',
			preferredLanguage: 'ENGLISH',
			needsVisa: false,
			needsCarPass: false,
			needsCarFromOrganizer: false,
			documents: [
				{
					id: '',
					file: undefined,
					altText: 'Passport',
					documentType: 'PASSPORT',
				},
				{
					id: '',
					file: undefined,
					altText: 'Photo',
					documentType: 'PHOTO',
				},
				{
					id: '',
					file: undefined,
					altText: 'Invitation Letter',
					documentType: 'LETTER',
				},
			],
		},
	})

	/*
	 * ============================================================================
	 * PARTICIPANT TYPE FILTERING LOGIC - TWO-DIMENSIONAL QUOTA MODEL
	 * ============================================================================
	 *
	 * Each InvitationConstraint is a "bucket" with TWO dimensions:
	 *
	 * ┌─────────────────────────────────────────────────────────────────────────┐
	 * │ DIMENSION 1: ParticipantType                                            │
	 * │ Controls which participant types can use this bucket.                   │
	 * │ - "Any": All participant types can use this bucket                      │
	 * │ - Specific (e.g., "Delegate"): Only that type can use this bucket       │
	 * ├─────────────────────────────────────────────────────────────────────────┤
	 * │ DIMENSION 2: AccessLevel                                                │
	 * │ Controls what meeting access participants get (affects wishlist).       │
	 * │ - CLOSED: Participants who select Closed Session use this bucket        │
	 * │ - OPEN/FREE/ALL: Participants who don't select Closed Session use this  │
	 * └─────────────────────────────────────────────────────────────────────────┘
	 *
	 * QUOTA HIERARCHY (checked in order):
	 *
	 * 1. Invitation.maximumQuota (ABSOLUTE CEILING)
	 *    - If total participants >= maximumQuota → ALL types hidden
	 *
	 * 2. Constraint Buckets (ADDITIVE CAPACITY)
	 *    - A type shows if ANY applicable bucket has available quota
	 *    - "Applicable" means: participantType is "Any" OR matches the type
	 *    - Multiple buckets ADD capacity (e.g., Any CLOSED 20 + Any OPEN ∞ = ∞)
	 *
	 * ============================================================================
	 * EXAMPLE SCENARIOS
	 * ============================================================================
	 *
	 * ┌──────────────────────────────────────────────────────────────────────────┐
	 * │ SCENARIO 1: Basic "Any" with Access Levels                               │
	 * │                                                                          │
	 * │ Constraints:                                                             │
	 * │   • Any, CLOSED, 20                                                      │
	 * │   • Any, OPEN, Unlimited                                                 │
	 * │                                                                          │
	 * │ Behavior:                                                                │
	 * │   - Dropdown: ALL participant types show (Any covers everyone)           │
	 * │   - Wishlist: Closed Session available until 20 participants select it   │
	 * │   - Capacity: Effectively unlimited (OPEN bucket has no limit)           │
	 * │                                                                          │
	 * │ Example states:                                                          │
	 * │   • 5 with Closed Session, 10 without → All types show, Closed available │
	 * │   • 20 with Closed Session, 50 without → All types show, Closed HIDDEN   │
	 * │   • 0 with Closed Session, 100 without → All types show, Closed available│
	 * └──────────────────────────────────────────────────────────────────────────┘
	 *
	 * ┌──────────────────────────────────────────────────────────────────────────┐
	 * │ SCENARIO 2: "Any" with Specific Type Sub-limit                           │
	 * │                                                                          │
	 * │ Constraints:                                                             │
	 * │   • Any, CLOSED, 20       (overall Closed Session cap)                   │
	 * │   • Any, OPEN, Unlimited  (unlimited Open access)                        │
	 * │   • Delegate, CLOSED, 5   (Delegates with Closed Session capped at 5)    │
	 * │                                                                          │
	 * │ Behavior:                                                                │
	 * │   - Dropdown: ALL types show (Any covers everyone)                       │
	 * │   - Delegates can request Closed Session only until 5 do so              │
	 * │   - Other types can request Closed Session until 20 total                │
	 * │   - All types can register without Closed Session (unlimited)            │
	 * │                                                                          │
	 * │ Example states:                                                          │
	 * │   • 3 Delegates+Closed, 10 Press+Closed → Delegate+Closed: 2 left,       │
	 * │                                           Total Closed: 7 left           │
	 * │   • 5 Delegates+Closed, 10 Press+Closed → Delegate can't select Closed,  │
	 * │                                           but can still register (OPEN)  │
	 * │   • 5 Delegates+Closed, 15 others+Closed → Closed Session HIDDEN for all │
	 * └──────────────────────────────────────────────────────────────────────────┘
	 *
	 * ┌──────────────────────────────────────────────────────────────────────────┐
	 * │ SCENARIO 3: Specific Types Only (No "Any")                               │
	 * │                                                                          │
	 * │ Constraints:                                                             │
	 * │   • Delegate, CLOSED, 10                                                 │
	 * │   • Delegate, OPEN, 20                                                   │
	 * │   • Press, OPEN, 15                                                      │
	 * │                                                                          │
	 * │ Behavior:                                                                │
	 * │   - Dropdown: ONLY Delegate and Press show (no "Any" = restricted)       │
	 * │   - Observer, VIP, etc. are NOT allowed (no constraint for them)         │
	 * │   - Delegates: 10 can request Closed Session, 20 can have Open access    │
	 * │   - Press: Only Open access (no CLOSED constraint), max 15               │
	 * │                                                                          │
	 * │ Example states:                                                          │
	 * │   • 10 Delegates+Closed, 20 Delegates+Open → Delegate HIDDEN             │
	 * │   • 5 Delegates+Closed, 10 Delegates+Open → Delegate shows (has capacity)│
	 * │   • 15 Press+Open → Press HIDDEN                                         │
	 * │   • 0 of anything → Delegate and Press show, Observer hidden             │
	 * └──────────────────────────────────────────────────────────────────────────┘
	 *
	 * ┌──────────────────────────────────────────────────────────────────────────┐
	 * │ SCENARIO 4: Mixed with Invitation Maximum Quota                          │
	 * │                                                                          │
	 * │ Invitation.maximumQuota = 50                                             │
	 * │ Constraints:                                                             │
	 * │   • Any, CLOSED, 20                                                      │
	 * │   • Any, OPEN, Unlimited                                                 │
	 * │                                                                          │
	 * │ Behavior:                                                                │
	 * │   - Even though OPEN is unlimited, total capped at 50                    │
	 * │   - Once 50 participants registered, ALL types hidden                    │
	 * │                                                                          │
	 * │ Example states:                                                          │
	 * │   • 10 Closed + 30 Open = 40 total → All types show                      │
	 * │   • 20 Closed + 30 Open = 50 total → ALL types HIDDEN (max reached)      │
	 * │   • 5 Closed + 45 Open = 50 total → ALL types HIDDEN (max reached)       │
	 * └──────────────────────────────────────────────────────────────────────────┘
	 *
	 * ┌──────────────────────────────────────────────────────────────────────────┐
	 * │ SCENARIO 5: No Constraints at All                                        │
	 * │                                                                          │
	 * │ Constraints: (empty)                                                     │
	 * │                                                                          │
	 * │ Behavior:                                                                │
	 * │   - Dropdown: ALL participant types show                                 │
	 * │   - Wishlist: All meeting types available                                │
	 * │   - No quota restrictions from constraints                               │
	 * │   - Only Invitation.maximumQuota applies (if set)                        │
	 * └──────────────────────────────────────────────────────────────────────────┘
	 *
	 * SUMMARY - A participant type shows if:
	 * 1. Invitation.maximumQuota not exceeded (if set)
	 * 2. At least ONE applicable constraint bucket has available quota
	 *    - "Applicable" = participantType is "Any" OR matches the specific type
	 * ============================================================================
	 */
	const availableParticipantTypes = useMemo(() => {
		const baseTypes = participantTypes.filter(pt => pt.name !== 'Any')

		// User role: all participant types available (no invitation needed)
		if (!isFocal) {
			return baseTypes
		}

		// Focal role: must have invitation selected
		if (!fields.invitationId.value) return []

		const selectedInvitation = invitations.find(
			inv => inv.id === fields.invitationId.value,
		)
		if (!selectedInvitation) return []

		const totalParticipants = selectedInvitation.participants.length

		// CHECK 1: Invitation's maximum quota (absolute ceiling)
		if (
			selectedInvitation.maximumQuota !== null &&
			totalParticipants >= selectedInvitation.maximumQuota
		) {
			return []
		}

		// No invitation constraints = NO restrictions - allow all participant types
		if (!selectedInvitation.invitationConstraints?.length) {
			return baseTypes
		}

		// Helper: Check if a constraint has available quota
		const hasAvailableQuota = (constraint: any) => {
			if (constraint.quota === null) return true // Unlimited
			const count = Number(constraint.participantCount) || 0
			return count < constraint.quota
		}

		// Filter participant types based on constraint availability
		return baseTypes.filter(pt => {
			// Find all constraints applicable to this type:
			// - "Any" constraints (cover all types)
			// - Specific constraints for this exact type
			const applicableConstraints =
				selectedInvitation.invitationConstraints.filter(
					(ic: any) =>
						ic.participantType?.name === 'Any' ||
						ic.participantTypeId === pt.id,
				)

			// No applicable constraints = type not allowed
			if (applicableConstraints.length === 0) return false

			// Type is allowed if at least ONE applicable constraint has available quota
			return applicableConstraints.some(hasAvailableQuota)
		})
	}, [participantTypes, fields.invitationId.value, invitations, isFocal])

	/*
	 * ============================================================================
	 * QUOTA STATUS CALCULATION - TWO-DIMENSIONAL MODEL
	 * ============================================================================
	 * Provides detailed status messages about constraint quota availability.
	 * This is used to show warnings/errors in the UI when quotas are reached.
	 *
	 * Each constraint is a "bucket" with:
	 * - ParticipantType: "Any" (all types) or specific type
	 * - AccessLevel: CLOSED (Closed Session) or OPEN/FREE/ALL
	 * - Quota: max capacity for this bucket
	 * - participantCount: current usage (based on type + access level match)
	 *
	 * ============================================================================
	 * STATUS TYPES RETURNED
	 * ============================================================================
	 *
	 * 1. 'maximum_quota_exceeded'
	 *    - Invitation.maximumQuota has been reached
	 *    - Example: Invitation allows max 50, and 50 are registered
	 *    - Result: No more registrations possible
	 *
	 * 2. 'all_buckets_exhausted'
	 *    - ALL constraint buckets are at capacity
	 *    - Example: Constraints are [Delegate,CLOSED,10] and [Delegate,OPEN,20]
	 *              Both have reached their limits
	 *    - Result: No more registrations possible for any configuration
	 *
	 * 3. 'closed_session_exhausted'
	 *    - ALL CLOSED constraints are at capacity
	 *    - Example: Constraints are [Any,CLOSED,20] and [Any,OPEN,Unlimited]
	 *              20 participants have selected Closed Session
	 *    - Result: Can still register, but can't select Closed Session
	 *
	 * 4. 'some_buckets_exhausted'
	 *    - SOME constraint buckets are at capacity, but others have space
	 *    - Example: Constraints are [Delegate,CLOSED,5], [Any,CLOSED,20], [Any,OPEN,∞]
	 *              5 Delegates have Closed Session (Delegate,CLOSED full)
	 *              but Any,CLOSED still has space
	 *    - Result: Informational - some options limited
	 *
	 * 5. null
	 *    - No issues, all quotas have space
	 *
	 * ============================================================================
	 * EXAMPLES
	 * ============================================================================
	 *
	 * EXAMPLE 1: Invitation max quota hit
	 * ───────────────────────────────────
	 * Invitation.maximumQuota = 50
	 * Constraints: [Any,CLOSED,20], [Any,OPEN,Unlimited]
	 * State: 10 Closed + 40 Open = 50 total
	 * → Returns: 'maximum_quota_exceeded'
	 * → Message: "Maximum invitation quota reached (50/50 participants registered)"
	 *
	 * EXAMPLE 2: All buckets full
	 * ───────────────────────────
	 * Constraints: [Delegate,CLOSED,10], [Delegate,OPEN,20]
	 * State: 10 Delegates+Closed, 20 Delegates+Open
	 * → Returns: 'all_buckets_exhausted'
	 * → Message: "All quota buckets are exhausted"
	 *
	 * EXAMPLE 3: Closed Session exhausted
	 * ────────────────────────────────────
	 * Constraints: [Any,CLOSED,20], [Any,OPEN,Unlimited]
	 * State: 20 with Closed Session selected
	 * → Returns: 'closed_session_exhausted'
	 * → Message: "Closed Session quota exhausted"
	 *
	 * EXAMPLE 4: Some buckets exhausted (informational)
	 * ──────────────────────────────────────────────────
	 * Constraints: [Any,CLOSED,20], [Delegate,CLOSED,5], [Any,OPEN,Unlimited]
	 * State: 5 Delegates+Closed (Delegate,CLOSED full), 10 Others+Closed
	 * → Returns: 'some_buckets_exhausted'
	 * → Message: "Some quota buckets reached capacity"
	 * → Details: "Delegate (CLOSED): 5/5"
	 *
	 * ============================================================================
	 */
	const quotaStatus = useMemo(() => {
		// Only show quota status for focal users with an invitation selected
		if (!isFocal || !fields.invitationId.value) {
			return null
		}

		const selectedInvitation = invitations.find(
			inv => inv.id === fields.invitationId.value,
		)
		if (!selectedInvitation) return null

		const totalParticipants = selectedInvitation.participants.length
		const maxQuota = selectedInvitation.maximumQuota

		// CHECK 1: Maximum invitation quota (absolute ceiling)
		if (maxQuota !== null && totalParticipants >= maxQuota) {
			return {
				type: 'maximum_quota_exceeded' as const,
				message: `Maximum invitation quota reached (${totalParticipants}/${maxQuota} participants registered)`,
			}
		}

		// No constraints = no restrictions
		if (!selectedInvitation.invitationConstraints?.length) {
			return null
		}

		// Build constraint status for display
		const constraintStatus = selectedInvitation.invitationConstraints.map(
			(ic: any) => {
				const participantCount = Number(ic.participantCount) || 0
				const quota = ic.quota
				const available = quota === null ? Infinity : quota - participantCount
				return {
					typeName: ic.participantType?.name || 'Unknown',
					accessLevel: ic.accessLevel,
					quota,
					registered: participantCount,
					available: quota === null ? null : available,
					isExhausted: quota !== null && participantCount >= quota,
					label: `${ic.participantType?.name || 'Unknown'} (${ic.accessLevel})`,
				}
			},
		)

		// Check if ALL constraints are exhausted (no buckets have space)
		const allExhausted = constraintStatus.every(cs => cs.isExhausted)

		if (allExhausted) {
			const details = constraintStatus
				.map(cs => `${cs.label}: ${cs.registered}/${cs.quota}`)
				.join(', ')
			return {
				type: 'all_buckets_exhausted' as const,
				message: `All quota buckets are exhausted`,
				details,
				constraints: constraintStatus,
			}
		}

		// Check for exhausted CLOSED constraints (affects Closed Session availability)
		const closedConstraints = constraintStatus.filter(
			cs => cs.accessLevel === 'CLOSED',
		)
		const allClosedExhausted =
			closedConstraints.length > 0 &&
			closedConstraints.every(cs => cs.isExhausted)

		if (allClosedExhausted) {
			const details = closedConstraints
				.map(cs => `${cs.typeName}: ${cs.registered}/${cs.quota}`)
				.join(', ')
			return {
				type: 'closed_session_exhausted' as const,
				message: `Closed Session quota exhausted`,
				details,
				constraints: constraintStatus,
			}
		}

		// Check for any exhausted buckets (informational)
		const exhaustedBuckets = constraintStatus.filter(cs => cs.isExhausted)
		if (exhaustedBuckets.length > 0) {
			const details = exhaustedBuckets
				.map(cs => `${cs.label}: ${cs.registered}/${cs.quota}`)
				.join(', ')
			return {
				type: 'some_buckets_exhausted' as const,
				message: `Some quota buckets reached capacity`,
				details,
				constraints: constraintStatus,
			}
		}

		return null
	}, [fields.invitationId.value, invitations, isFocal])

	const documents = fields.documents.getFieldList()

	// Focal users with no invitations: show blocking message
	if (isFocal && invitations.length === 0) {
		return (
			<Card className="mx-auto w-full max-w-lg">
				<CardHeader>
					<div className="flex justify-center">
						<AlertCircle className="h-12 w-12 text-muted-foreground" />
					</div>
					<CardTitle className="text-center text-xl font-semibold">
						No Invitations Found
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-center text-muted-foreground">
						You don&apos;t have any invitations for this event. Please contact
						the event organizer to get an invitation before registering
						participants.
					</p>
				</CardContent>
				<CardFooter className="flex justify-center">
					<Button asChild variant="link">
						<Link to="/events">Back to Events</Link>
					</Button>
				</CardFooter>
			</Card>
		)
	}

	// User role: already registered - show success message
	if (!canRegister) {
		return (
			<Card className="mx-auto w-full max-w-lg">
				<CardHeader>
					<div className="flex justify-center">
						<CheckCircle className="h-12 w-12 text-primary" />
					</div>
					<CardTitle className="text-center text-xl font-semibold">
						You are all set!
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-center text-muted-foreground">
						You have already been registered for this event. You can view your
						registration details in your dashboard.
					</p>
				</CardContent>
				<CardFooter className="flex justify-center">
					<Button asChild variant="link">
						<Link to="/requests">
							Go to Dashboard <span aria-hidden="true">→</span>
						</Link>
					</Button>
				</CardFooter>
			</Card>
		)
	}

	return (
		<div className="space-y-6 px-32">
			{form.errors && (
				<Alert variant="destructive">
					<AlertCircle className="h-4 w-4" />
					<AlertDescription>
						<ErrorList errors={form.errors} id={form.errorId} />
					</AlertDescription>
				</Alert>
			)}

			<FormCard
				formId={form.id}
				onSubmit={form.onSubmit}
				encType="multipart/form-data"
				bordered={false}
				buttons={[
					{
						label: 'Submit Request',
						intent: 'save',
						variant: 'default',
						type: 'submit',
						disabled: isPending,
						status: isPending
							? 'pending'
							: (actionData?.result.status ?? 'idle'),
					},
					{
						label: 'Cancel',
						to: `/requests`,
						type: 'link',
					},
				]}
			>
				<AuthenticityTokenInput />
				<HoneypotInputs />
				<InputField meta={fields.tenantId} type="hidden" />
				<InputField meta={fields.eventId} type="hidden" />

				{/* Quota Display for Focal Users */}
				{userHasRole(user, 'focal') && invitations.length > 0 && (
					<div className="space-y-4">
						<h2 className="flex items-center gap-2 text-base font-semibold">
							Invitation Quota
						</h2>
						<Card>
							<CardContent className="pt-6">
								<div className="space-y-6">
									{invitations.map(invitation => (
										<div key={invitation.id}>
											<div className="mb-4 rounded-lg border bg-muted/50 px-4 py-2">
												<div className="flex items-center justify-between">
													<div>
														<h3 className="font-semibold">
															{invitation.organization}
														</h3>
													</div>
													{invitation.maximumQuota ? (
														<Badge
															variant={
																invitation.participants.filter(
																	(p: any) =>
																		p.organization === invitation.organization,
																).length >= invitation.maximumQuota
																	? 'destructive'
																	: 'secondary'
															}
															className="flex items-center gap-2 text-xs"
														>
															Count:{' '}
															<span className="font-semibold">
																{
																	invitation.participants.filter(
																		(p: any) =>
																			p.organization ===
																			invitation.organization,
																	).length
																}
															</span>
															<Separator
																orientation="vertical"
																className="h-4"
															/>
															Quota:{' '}
															<span className="font-semibold">
																{invitation.maximumQuota}
															</span>
														</Badge>
													) : (
														<Badge variant="default" className="text-xs">
															Maximum: Unlimited
														</Badge>
													)}
												</div>
											</div>

											<div className="grid gap-2 pl-4">
												{invitation.invitationConstraints?.map(
													(constraint: any) => {
														const registeredCount =
															Number(constraint.participantCount) || 0
														const quota = constraint.quota
														const isUnlimited = quota === null
														const available = isUnlimited
															? Infinity
															: quota - registeredCount
														const usagePercentage = isUnlimited
															? 0
															: (registeredCount / quota) * 100

														return (
															<div
																key={constraint.id}
																className="grid grid-cols-[1fr,auto,auto] items-center gap-4"
															>
																<div className="flex items-center gap-3">
																	<span className="text-sm font-medium">
																		{constraint.participantType?.name} (
																		{constraint.accessLevel})
																	</span>
																	{!isUnlimited && (
																		<div className="flex-1">
																			<Progress
																				value={usagePercentage}
																				className="h-1.5"
																			/>
																		</div>
																	)}
																</div>
																<span className="whitespace-nowrap text-xs text-muted-foreground">
																	{isUnlimited
																		? `${registeredCount}`
																		: `${registeredCount}/${quota}`}
																</span>
																{isUnlimited ? (
																	<Badge
																		variant="secondary"
																		className="text-xs"
																	>
																		Unlimited
																	</Badge>
																) : available > 0 ? (
																	<Badge variant="default" className="text-xs">
																		{available} Left
																	</Badge>
																) : (
																	<Badge
																		variant="destructive"
																		className="text-xs"
																	>
																		{registeredCount > quota
																			? 'Exceeded'
																			: 'Full'}
																	</Badge>
																)}
															</div>
														)
													},
												)}
											</div>
										</div>
									))}
								</div>
							</CardContent>
						</Card>
					</div>
				)}

				{/* Section 1: General Information */}
				<div className="space-y-4">
					<h2 className="flex items-center gap-2 text-base font-semibold">
						General Information
					</h2>
					<Card>
						<CardContent className="space-y-4 pt-6">
							{/* Invitation field - required for focal users, not shown for regular users */}
							{isFocal && (
								<Field>
									<Label htmlFor={fields.invitationId.id}>
										Invitation <span className="text-destructive">*</span>
									</Label>
									<SelectField
										meta={fields.invitationId}
										items={invitations.map(invitation => ({
											name: invitation.organization,
											value: invitation.id,
										}))}
										placeholder="Select invitation"
									/>
									{fields.invitationId.errors && (
										<FieldError>{fields.invitationId.errors}</FieldError>
									)}
									<p className="text-xs text-muted-foreground">
										Select the organization you are registering for
									</p>
								</Field>
							)}

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<Field>
									<Label htmlFor={fields.firstName.id}>First Name</Label>
									<InputField meta={fields.firstName} type="text" />
									{fields.firstName.errors && (
										<FieldError>{fields.firstName.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.familyName.id}>Family Name</Label>
									<InputField meta={fields.familyName} type="text" />
									{fields.familyName.errors && (
										<FieldError>{fields.familyName.errors}</FieldError>
									)}
								</Field>
							</div>

							<Field>
								<Label htmlFor={fields.gender.id}>Gender</Label>
								<SelectField
									meta={fields.gender}
									items={['MALE', 'FEMALE'].map(gender => ({
										name: gender,
										value: gender,
									}))}
									placeholder="Select"
								/>
								{fields.gender.errors && (
									<FieldError>{fields.gender.errors}</FieldError>
								)}
							</Field>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<Field>
									<Label htmlFor={fields.titleId.id}>Title</Label>
									<SelectField
										meta={fields.titleId}
										items={titles.map(title => ({
											name: title.name,
											value: title.id,
										}))}
										placeholder="Select"
									/>
									{fields.titleId.errors && (
										<FieldError>{fields.titleId.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.dateOfBirth.id}>Date of Birth</Label>
									<DatePickerField meta={fields.dateOfBirth} />
									{fields.dateOfBirth.errors && (
										<FieldError>{fields.dateOfBirth.errors}</FieldError>
									)}
								</Field>
							</div>

							<Field>
								<Label htmlFor={fields.nationalityId.id}>Nationality</Label>
								<SelectField
									meta={fields.nationalityId}
									items={countries.map(country => ({
										name: country.name,
										value: country.id,
									}))}
									placeholder="Select"
								/>
								{fields.nationalityId.errors && (
									<FieldError>{fields.nationalityId.errors}</FieldError>
								)}
							</Field>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<Field>
									<Label htmlFor={fields.passportNumber.id}>
										Passport Number
									</Label>
									<InputField meta={fields.passportNumber} type="text" />
									{fields.passportNumber.errors && (
										<FieldError>{fields.passportNumber.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.passportExpiry.id}>
										Passport Expiry
									</Label>
									<DatePickerField meta={fields.passportExpiry} />
									{fields.passportExpiry.errors && (
										<FieldError>{fields.passportExpiry.errors}</FieldError>
									)}
								</Field>
							</div>

							<Field>
								<Label htmlFor={fields.participantTypeId.id}>
									Participant Type
								</Label>
								{/*
								 * PARTICIPANT TYPE DROPDOWN - Available Quota Display
								 * ===================================================
								 * For each participant type, sum available quota from ALL applicable
								 * constraints:
								 * - "Any" constraints (cover all types)
								 * - Specific constraints for this type
								 *
								 * Example:
								 *   Constraints: [Delegate,CLOSED,10], [Delegate,OPEN,20], [Any,OPEN,∞]
								 *   For Delegate: 10 + 20 + ∞ = Unlimited
								 *   For Press: ∞ (only Any,OPEN applies) = Unlimited
								 *
								 * If ANY constraint has unlimited quota → show "Unlimited"
								 * Otherwise → sum available from all constraints
								 */}
								<SelectField
									meta={fields.participantTypeId}
									items={availableParticipantTypes.map(pt => {
										// For focal users with invitation, show quota info
										if (isFocal && fields.invitationId.value) {
											const selectedInvitation = invitations.find(
												inv => inv.id === fields.invitationId.value,
											)

											// Find ALL applicable constraints for this type
											// (includes "Any" constraints + specific type constraints)
											const applicableConstraints =
												selectedInvitation?.invitationConstraints?.filter(
													(ic: any) =>
														ic.participantType?.name === 'Any' ||
														ic.participantTypeId === pt.id,
												) || []

											if (applicableConstraints.length > 0) {
												// Check if ANY constraint has unlimited quota
												const hasUnlimited = applicableConstraints.some(
													(ic: any) => ic.quota === null,
												)

												if (hasUnlimited) {
													return {
														name: `${pt.name} (Unlimited)`,
														value: pt.id,
													}
												}

												// Sum available quota from all applicable constraints
												const totalAvailable = applicableConstraints.reduce(
													(sum: number, ic: any) => {
														const count = Number(ic.participantCount) || 0
														const available = (ic.quota || 0) - count
														return sum + Math.max(0, available)
													},
													0,
												)

												return {
													name: `${pt.name} (${totalAvailable} available)`,
													value: pt.id,
												}
											}
										}

										return {
											name: pt.name,
											value: pt.id,
										}
									})}
									placeholder={
										isFocal && !fields.invitationId.value
											? 'Select invitation first'
											: 'Select'
									}
									disabled={isFocal && !fields.invitationId.value}
								/>
								{fields.participantTypeId.errors && (
									<FieldError>{fields.participantTypeId.errors}</FieldError>
								)}
								{quotaStatus && availableParticipantTypes.length === 0 && (
									<div className="mt-2 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
										<p className="font-medium">{quotaStatus.message}</p>
										{quotaStatus.details && (
											<p className="mt-1 text-xs opacity-80">
												{quotaStatus.details}
											</p>
										)}
									</div>
								)}
							</Field>
						</CardContent>
					</Card>
				</div>

				{/* Section 2: Professional Information */}
				<div className="space-y-4">
					<h2 className="flex items-center gap-2 text-base font-semibold">
						Professional Information
					</h2>
					<Card>
						<CardContent className="space-y-4 pt-6">
							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<Field>
									<Label htmlFor={fields.organization.id}>Organization</Label>
									<InputField meta={fields.organization} type="text" />
									{fields.organization.errors && (
										<FieldError>{fields.organization.errors}</FieldError>
									)}
								</Field>

								<Field>
									<Label htmlFor={fields.jobTitle.id}>Job Title</Label>
									<InputField meta={fields.jobTitle} type="text" />
									{fields.jobTitle.errors && (
										<FieldError>{fields.jobTitle.errors}</FieldError>
									)}
								</Field>
							</div>

							<Field>
								<Label htmlFor={fields.countryId.id}>Country</Label>
								<SelectField
									meta={fields.countryId}
									items={countries.map(country => ({
										name: country.name,
										value: country.id,
									}))}
									placeholder="Select Your Country"
								/>
								{fields.countryId.errors && (
									<FieldError>{fields.countryId.errors}</FieldError>
								)}
							</Field>

							<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
								<Field>
									<Label htmlFor={fields.city.id}>City</Label>
									<InputField meta={fields.city} type="text" />
									{fields.city.errors && (
										<FieldError>{fields.city.errors} </FieldError>
									)}
								</Field>

								{/* Email field - visible and optional for focal, hidden for regular users */}
								{isFocal ? (
									<Field>
										<Label htmlFor={fields.email.id}>
											Email{' '}
											<span className="text-muted-foreground">(Optional)</span>
										</Label>
										<InputField meta={fields.email} type="email" />
										<p className="text-xs text-muted-foreground">
											Leave blank if participant&apos;s email is not available
										</p>
										{fields.email.errors && (
											<FieldError>{fields.email.errors}</FieldError>
										)}
									</Field>
								) : (
									// User role: email hidden, uses logged-in user's email
									<InputField meta={fields.email} type="hidden" />
								)}
							</div>

							<Field>
								<Label htmlFor={fields.preferredLanguage.id}>
									Preferred Language
								</Label>
								<SelectField
									meta={fields.preferredLanguage}
									items={[
										'ENGLISH',
										'FRENCH',
										'PORTUGUESE',
										'ARABIC',
										'SWAHLI',
										'OTHER',
									].map(language => ({
										name: language,
										value: language,
									}))}
									placeholder="Select Preferred Language"
								/>
								{fields.preferredLanguage.errors && (
									<FieldError>{fields.preferredLanguage.errors}</FieldError>
								)}
							</Field>
						</CardContent>
					</Card>
				</div>

				{/* Section 3: Wishlist (Optional) */}
				<div className="space-y-4">
					<h2 className="flex items-center gap-2 text-base font-semibold">
						Meeting Wishlist (Optional)
					</h2>
					<Card>
						<CardContent className="space-y-4 pt-6">
							<Field>
								<fieldset>
									{/*
									 * ================================================================
									 * CLOSED SESSION WISHLIST FILTERING LOGIC
									 * ================================================================
									 *
									 * Closed Session checkbox dynamically shows/hides based on:
									 * 1. The selected participant type
									 * 2. CLOSED constraints and their available quotas
									 *
									 * RULE: Show Closed Session only if the selected participant type
									 * has available CLOSED quota (checking both type-specific and "Any"
									 * constraints).
									 *
									 * ================================================================
									 * PRIORITY LOGIC
									 * ================================================================
									 *
									 * 1. If type-specific CLOSED constraint exists:
									 *    - Check its quota first (type-specific takes precedence)
									 *    - Also check "Any" CLOSED (overall cap) if it exists
									 *    - BOTH must have quota for Closed Session to show
									 *
									 * 2. If no type-specific constraint, use "Any" CLOSED constraint
									 *
									 * 3. If no CLOSED constraints at all, show Closed Session
									 *
									 * ================================================================
									 * EXAMPLES
									 * ================================================================
									 *
									 * EXAMPLE 1: Any CLOSED with quota
									 * ────────────────────────────────
									 * Constraints:
									 *   • Any, CLOSED, 20
									 *   • Any, OPEN, Unlimited
									 *
									 * User selects Delegate:
									 * → No Delegate-specific CLOSED constraint
									 * → Falls back to "Any, CLOSED"
									 * → If count < 20, Closed Session SHOWS
									 * → If count >= 20, Closed Session HIDDEN
									 *
									 * EXAMPLE 2: Type-specific sub-limits (FIXED BEHAVIOR)
									 * ─────────────────────────────────────────────────────
									 * Constraints:
									 *   • Any, CLOSED, 20       (overall cap)
									 *   • Delegate, CLOSED, 5   (Delegate sub-limit)
									 *   • Any, OPEN, Unlimited
									 *
									 * State: 5 Delegates + 10 others have selected Closed
									 *
									 * User selects Delegate:
									 * → Found Delegate-specific constraint (quota: 5, count: 5)
									 * → Type-specific quota EXHAUSTED
									 * → Closed Session HIDDEN for Delegates
									 *
									 * User selects Press:
									 * → No Press-specific constraint
									 * → Falls back to "Any, CLOSED" (quota: 20, count: 15)
									 * → "Any" has space (15 < 20)
									 * → Closed Session SHOWS for Press
									 *
									 * EXAMPLE 3: Both type-specific and Any exhausted
									 * ─────────────────────────────────────────────────
									 * Constraints:
									 *   • Any, CLOSED, 20
									 *   • Delegate, CLOSED, 5
									 *
									 * State: 5 Delegates + 15 others have selected Closed
									 *
									 * User selects ANY participant type:
									 * → "Any, CLOSED" count = 20 (FULL)
									 * → Closed Session HIDDEN for ALL types
									 *
									 * EXAMPLE 4: Type-specific has room but Any is full
									 * ────────────────────────────────────────────────
									 * Constraints:
									 *   • Any, CLOSED, 20
									 *   • Delegate, CLOSED, 10
									 *
									 * State: 3 Delegates + 17 others have selected Closed
									 *
									 * User selects Delegate:
									 * → Delegate-specific has room (3 < 10)
									 * → BUT "Any, CLOSED" is full (20 >= 20)
									 * → Closed Session HIDDEN (overall cap reached)
									 *
									 * ================================================================
									 */}
									<CheckboxGroupField
										meta={fields.meetings}
										items={meetingTypes
											.filter(meetingType => {
												if (meetingType.name === 'Closed Session') {
													// For focal users, check CLOSED constraints based on selected participant type
													if (isFocal && fields.invitationId.value) {
														const selectedInvitation = invitations.find(
															inv => inv.id === fields.invitationId.value,
														)
														if (!selectedInvitation) return false

														// Find all CLOSED constraints
														const closedConstraints =
															selectedInvitation.invitationConstraints?.filter(
																(ic: any) => ic.accessLevel === 'CLOSED',
															) || []

														// If no CLOSED constraints exist, hide Closed Session
														// (invitation only allows OPEN access)
														if (closedConstraints.length === 0) return false

														// Get the selected participant type ID
														const selectedParticipantTypeId =
															fields.participantTypeId.value

														// If no participant type selected yet, check if ANY constraint has quota
														if (!selectedParticipantTypeId) {
															return closedConstraints.some((constraint: any) => {
																if (constraint.quota === null) return true
																const count =
																	Number(constraint.participantCount) || 0
																return count < constraint.quota
															})
														}

														// Find type-specific CLOSED constraint for selected participant type
														const typeSpecificConstraint = closedConstraints.find(
															(ic: any) =>
																ic.participantTypeId === selectedParticipantTypeId,
														)

														// Find "Any" CLOSED constraint (wildcard that applies to all types)
														const anyConstraint = closedConstraints.find(
															(ic: any) => ic.participantType?.name === 'Any',
														)

														// Helper to check if a constraint has available quota
														const hasAvailableQuota = (constraint: any) => {
															if (!constraint) return false
															if (constraint.quota === null) return true // Unlimited
															const count =
																Number(constraint.participantCount) || 0
															return count < constraint.quota
														}

														// PRIORITY: Type-specific constraint takes precedence
														// If a type-specific constraint exists, it must have quota
														if (typeSpecificConstraint) {
															// Type-specific constraint exists - check its quota
															if (!hasAvailableQuota(typeSpecificConstraint)) {
																// Type-specific quota exhausted - hide Closed Session
																return false
															}
															// Type-specific has quota, but also check "Any" (overall cap)
															if (anyConstraint && !hasAvailableQuota(anyConstraint)) {
																// Overall cap exhausted - hide Closed Session
																return false
															}
															return true
														}

														// No type-specific constraint - check "Any" constraint
														if (anyConstraint) {
															return hasAvailableQuota(anyConstraint)
														}

														// No applicable CLOSED constraints for this participant type - hide Closed Session
														return false
													}
													// For non-focal users (role: 'user'), never show Closed Session
													return false
												}
												// Hide Executive Council Closed Session from user registration
												if (
													meetingType.name ===
													'Executive Council Closed Session'
												) {
													return false
												}
												return true
											})
											.map(meetingType => ({
												name: meetingType.name,
												value: meetingType.id,
											}))}
									/>
								</fieldset>
							</Field>
						</CardContent>
					</Card>
				</div>

				{/* Section 4: Supporting Documents */}
				<div className="space-y-4">
					<h2 className="flex items-center gap-2 text-base font-semibold">
						Supporting Documents
					</h2>
					<Card>
						<CardContent className="space-y-4 pt-6">
							{documents.map((document, index) => {
								const documentFields = document.getFieldset()
								return (
									<DocumentUploadField
										key={index}
										documentFields={documentFields}
										documentType={documentFields.documentType.value as string}
									/>
								)
							})}
						</CardContent>
					</Card>
				</div>
			</FormCard>
		</div>
	)
}
