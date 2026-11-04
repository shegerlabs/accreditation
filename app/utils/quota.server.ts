import { prisma } from '~/utils/db.server'

export type QuotaConstraintRow = {
	participantType: string
	accessLevel: string
	quota: number
	used: number
}

export type QuotaUsageInfo = {
	maximumQuota: number | null
	totalUsed: number
	constraints: QuotaConstraintRow[]
}

export async function getQuotaUsage(
	_participantId: string,
	invitationId: string | null,
): Promise<QuotaUsageInfo | null> {
	if (!invitationId) return null

	const invitation = await prisma.invitation.findUnique({
		where: { id: invitationId },
		select: {
			maximumQuota: true,
			invitationConstraints: {
				select: {
					quota: true,
					accessLevel: true,
					participantType: { select: { id: true, name: true } },
				},
			},
			participants: {
				where: {
					deletedAt: null,
					status: { notIn: ['REJECTED', 'CANCELLED'] },
				},
				select: {
					participantTypeId: true,
					attendClosedSession: true,
				},
			},
		},
	})

	if (!invitation) return null

	const { maximumQuota, invitationConstraints, participants } = invitation

	const constraints: QuotaConstraintRow[] = invitationConstraints.map(c => {
		const isAnyType = c.participantType.name === 'Any'
		const isClosedAccess = c.accessLevel === 'CLOSED'

		const used = participants.filter(p => {
			const typeMatches = isAnyType || p.participantTypeId === c.participantType.id
			const accessMatches = isClosedAccess
				? p.attendClosedSession === true
				: p.attendClosedSession !== true
			return typeMatches && accessMatches
		}).length

		return {
			participantType: c.participantType.name,
			accessLevel: c.accessLevel,
			quota: c.quota ?? 0,
			used,
		}
	})

	return {
		maximumQuota: maximumQuota ?? null,
		totalUsed: participants.length,
		constraints,
	}
}

export async function validateQuotaForTypeChange({
	participantId,
	invitationId,
	newParticipantTypeId,
	newAttendClosedSession,
}: {
	participantId: string
	invitationId: string | null
	newParticipantTypeId: string
	newAttendClosedSession: boolean
}): Promise<{ allowed: boolean; reason?: string }> {
	// No invitation means no quota to enforce
	if (!invitationId) {
		return { allowed: true }
	}

	const invitation = await prisma.invitation.findUnique({
		where: { id: invitationId },
		select: {
			maximumQuota: true,
			invitationConstraints: {
				select: {
					quota: true,
					accessLevel: true,
					participantType: { select: { id: true, name: true } },
				},
			},
			participants: {
				where: {
					deletedAt: null,
					// Exclude the current participant — they're being moved, not added
					id: { not: participantId },
					// Exclude rejected/cancelled participants from quota counts
					status: { notIn: ['REJECTED', 'CANCELLED'] },
				},
				select: {
					participantTypeId: true,
					attendClosedSession: true,
				},
			},
		},
	})

	if (!invitation) {
		return { allowed: true }
	}

	const { maximumQuota, invitationConstraints, participants } = invitation

	if (invitationConstraints.length > 0) {
		// Check per-constraint quotas
		const newAccessLevel = newAttendClosedSession ? 'CLOSED' : 'OPEN'

		// Find constraints matching the new type + access level
		const matchingConstraints = invitationConstraints.filter(c => {
			const isAnyType = c.participantType.name === 'Any'
			const typeMatches = isAnyType || c.participantType.id === newParticipantTypeId
			return typeMatches && c.accessLevel === newAccessLevel
		})

		// If constraints are defined but none match the new type+access combination,
		// that means there is no quota allocated for this combination — block it
		if (matchingConstraints.length === 0) {
			return {
				allowed: false,
				reason: `No quota allocated for this participant type with ${newAccessLevel} access level.`,
			}
		}

		for (const constraint of matchingConstraints) {
			const quota = constraint.quota ?? 0
			const isUnlimited = !quota || quota === 0
			if (isUnlimited) continue

			const isAnyType = constraint.participantType.name === 'Any'
			const isClosedAccess = constraint.accessLevel === 'CLOSED'

			// Count existing participants matching this constraint (excluding current participant)
			const usedCount = participants.filter(p => {
				const typeMatches = isAnyType || p.participantTypeId === constraint.participantType.id
				const accessMatches = isClosedAccess
					? p.attendClosedSession === true
					: p.attendClosedSession !== true
				return typeMatches && accessMatches
			}).length

			// The new participant would be added to this count
			if (usedCount + 1 > quota) {
				const typeName = isAnyType ? 'Any type' : constraint.participantType.name
				const accessLabel = constraint.accessLevel
				return {
					allowed: false,
					reason: `Quota exceeded for ${typeName} (${accessLabel}): ${quota} allowed, ${usedCount} already used.`,
				}
			}
		}

		// Also check maximumQuota if set
		if (maximumQuota && maximumQuota > 0) {
			// Total participants excluding current + 1 for the move
			if (participants.length + 1 > maximumQuota) {
				return {
					allowed: false,
					reason: `Overall invitation quota exceeded: ${maximumQuota} allowed, ${participants.length} already used.`,
				}
			}
		}
	} else {
		// No constraints — check maximumQuota only
		if (maximumQuota && maximumQuota > 0) {
			if (participants.length + 1 > maximumQuota) {
				return {
					allowed: false,
					reason: `Overall invitation quota exceeded: ${maximumQuota} allowed, ${participants.length} already used.`,
				}
			}
		}
	}

	return { allowed: true }
}

/**
 * Get participant types allowed for an invitation based on its constraints.
 * If no constraints exist, returns all participant types for the tenant.
 */
/**
 * Check if a participant can select Closed Session access level.
 * This considers the current participant (they're excluded from quota count since they're being edited).
 */
export async function isClosedSessionQuotaAvailable({
	participantId,
	invitationId,
	participantTypeId,
}: {
	participantId: string
	invitationId: string | null
	participantTypeId: string
}): Promise<boolean> {
	// No invitation means no quota to enforce
	if (!invitationId) {
		return true
	}

	const invitation = await prisma.invitation.findUnique({
		where: { id: invitationId },
		select: {
			invitationConstraints: {
				select: {
					quota: true,
					accessLevel: true,
					participantType: { select: { id: true, name: true } },
				},
			},
			participants: {
				where: {
					deletedAt: null,
					// Exclude the current participant — they're being moved, not added
					id: { not: participantId },
					// Exclude rejected/cancelled participants from quota counts
					status: { notIn: ['REJECTED', 'CANCELLED'] },
				},
				select: {
					participantTypeId: true,
					attendClosedSession: true,
				},
			},
		},
	})

	if (!invitation) {
		return true
	}

	const { invitationConstraints, participants } = invitation

	// If no constraints, CLOSED is always available
	if (invitationConstraints.length === 0) {
		return true
	}

	// Find CLOSED constraints that apply to this participant type
	const closedConstraints = invitationConstraints.filter(c => {
		const isAnyType = c.participantType.name === 'Any'
		const typeMatches = isAnyType || c.participantType.id === participantTypeId
		return typeMatches && c.accessLevel === 'CLOSED'
	})

	// If no CLOSED constraints exist, Closed Session is not allowed
	if (closedConstraints.length === 0) {
		return false
	}

	// Check each matching CLOSED constraint for quota availability
	for (const constraint of closedConstraints) {
		const quota = constraint.quota ?? 0
		const isUnlimited = !quota || quota === 0
		if (isUnlimited) {
			// At least one constraint has unlimited quota
			return true
		}

		const isAnyType = constraint.participantType.name === 'Any'

		// Count existing CLOSED participants matching this constraint
		const usedCount = participants.filter(p => {
			const typeMatches = isAnyType || p.participantTypeId === constraint.participantType.id
			const accessMatches = p.attendClosedSession === true
			return typeMatches && accessMatches
		}).length

		// Check if adding this participant would exceed quota
		if (usedCount + 1 <= quota) {
			// At least one constraint has room
			return true
		}
	}

	// All constraints are full
	return false
}

export async function getAllowedParticipantTypes({
	invitationId,
	tenantId,
}: {
	invitationId: string | null
	tenantId: string
}): Promise<{ id: string; name: string }[]> {
	// No invitation — return all participant types
	if (!invitationId) {
		return prisma.participantType.findMany({
			where: { tenantId },
			select: { id: true, name: true },
			orderBy: { name: 'asc' },
		})
	}

	const invitation = await prisma.invitation.findUnique({
		where: { id: invitationId },
		select: {
			invitationConstraints: {
				select: {
					participantType: { select: { id: true, name: true } },
				},
			},
		},
	})

	// No invitation found or no constraints — return all participant types
	if (!invitation || invitation.invitationConstraints.length === 0) {
		return prisma.participantType.findMany({
			where: { tenantId },
			select: { id: true, name: true },
			orderBy: { name: 'asc' },
		})
	}

	// Check if any "Any" constraint exists - if so, all types are allowed
	const hasAnyConstraint = invitation.invitationConstraints.some(
		c => c.participantType.name === 'Any'
	)

	if (hasAnyConstraint) {
		// "Any" constraint means all participant types are allowed
		return prisma.participantType.findMany({
			where: { tenantId },
			select: { id: true, name: true },
			orderBy: { name: 'asc' },
		})
	}

	// No "Any" constraint - only specific types are allowed
	const typeMap = new Map<string, { id: string; name: string }>()
	for (const constraint of invitation.invitationConstraints) {
		const pt = constraint.participantType
		if (!typeMap.has(pt.id)) {
			typeMap.set(pt.id, pt)
		}
	}

	return Array.from(typeMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}
