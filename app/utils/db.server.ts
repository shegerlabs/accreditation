import { remember } from '@epic-web/remember'
import { PrismaClient } from '@prisma/client'
import { LoaderFunctionArgs } from '@remix-run/node'
import chalk from 'chalk'

const prisma = remember('prisma', () => {
	// NOTE: if you change anything in this function you'll need to restart
	// the dev server to see your changes.
	const logThreshold = 20

	const client = new PrismaClient({
		log: [
			{ level: 'query', emit: 'event' },
			{ level: 'error', emit: 'stdout' },
			{ level: 'warn', emit: 'stdout' },
		],
	})
	client.$on('query', async e => {
		if (e.duration < logThreshold) return
		const color =
			e.duration < logThreshold * 1.1
				? 'green'
				: e.duration < logThreshold * 1.2
					? 'blue'
					: e.duration < logThreshold * 1.3
						? 'yellow'
						: e.duration < logThreshold * 1.4
							? 'redBright'
							: 'red'
		const dur = chalk[color](`${e.duration}ms`)
		console.info(`prisma:query - ${dur} - ${e.query}`)
	})
	client.$connect()
	return client
})

/**
 * Defines the parameters for pagination and filtering.
 */
type PaginationAndFilterParams<
	TWhereInput,
	TOrderByInput,
	TResult,
	TSelect = any,
	TInclude = undefined, // Changed default to 'undefined'
> = {
	request: LoaderFunctionArgs['request']
	model: {
		count: (args?: { where?: TWhereInput }) => Promise<number>
		findMany: (args?: {
			where?: TWhereInput
			orderBy?: TOrderByInput[]
			take?: number
			skip?: number
			select?: TSelect
			include?: TInclude
		}) => Promise<TResult[]>
	}
	searchFields: Array<SearchField>
	filterFields?: Array<FilterField>
	where?: TWhereInput
	orderBy: TOrderByInput[]
	select?: TSelect
	include?: TInclude
}

/**
 * Interface for specifying field options, such as operator and enum flag.
 */
interface FieldOptions {
	field: string
	operator?:
		| 'contains'
		| 'equals'
		| 'startsWith'
		| 'endsWith'
		| 'before'
		| 'after'
	isEnum?: boolean
	isDate?: boolean // Add this flag to indicate date fields
}

/**
 * Represents a field or set of fields to be searched.
 * Can be a string (single field), FieldOptions (with operator and enum flag),
 * a nested object for nested fields, or an array of SearchFields (multiple fields).
 *
 * @example
 * // Single string field
 * const field1: SearchField = 'name'
 *
 * // Enum field with operator
 * const field2: SearchField = { field: 'status', operator: 'equals', isEnum: true }
 *
 * // Nested fields
 * const field3: SearchField = { user: { profile: 'bio' } }
 *
 * // Multiple fields
 * const field4: SearchField = ['title', 'description', { author: 'name' }]
 */
type SearchField =
	| string
	| FieldOptions
	| { [key: string]: SearchField }
	| SearchField[]

/**
 * Interface for specifying field options for filtering, such as operator.
 */
interface FilterFieldOptions {
	field: string
	operator?: 'equals' | 'in' | 'before' | 'after' // Extendable for more operators if needed
	isDate?: boolean // Add this flag to indicate date fields
}

/**
 * Represents a field or set of fields to be used for exact filtering.
 * Can be a string (single field), FilterFieldOptions (with operator),
 * a nested object for nested fields, or an array of FilterFields (multiple fields).
 *
 * @example
 * // Single string field
 * const filter1: FilterField = 'status'
 *
 * // Field with operator
 * const filter2: FilterField = { field: 'role', operator: 'in' }
 *
 * // Multiple fields
 * const filter3: FilterField = ['status', { field: 'role', operator: 'equals' }]
 */
type FilterField =
	| string
	| FilterFieldOptions
	| { [key: string]: FilterField } // For nested filter fields
	| FilterField[]

/**
 * Represents a search condition object.
 * Keys are strings, and values can be of any type.
 * Used to build dynamic search queries.
 *
 * @example
 * const condition: SearchCondition = {
 *   name: { contains: 'John', mode: 'insensitive' },
 *   status: { equals: 'ACTIVE' }
 * }
 */
type SearchCondition = {
	[key: string]: any
}

/**
 * Type guard to check if a SearchField is FieldOptions.
 *
 * @param field - The SearchField to check.
 * @returns True if field is FieldOptions, else false.
 */
function isFieldOptions(field: SearchField): field is FieldOptions {
	return (
		typeof field === 'object' &&
		!Array.isArray(field) &&
		field !== null &&
		'field' in field &&
		typeof (field as any).field === 'string'
	)
}

/**
 * Type guard to check if a SearchField is a nested field object.
 *
 * @param field - The SearchField to check.
 * @returns True if field is a nested object, else false.
 */
function isNestedField(
	field: SearchField,
): field is { [key: string]: SearchField } {
	return (
		typeof field === 'object' &&
		!Array.isArray(field) &&
		field !== null &&
		!('field' in field)
	)
}

/**
 * Type guard to check if a FilterField is FilterFieldOptions.
 *
 * @param field - The FilterField to check.
 * @returns True if field is FilterFieldOptions, else false.
 */
function isFilterFieldOptions(field: FilterField): field is FilterFieldOptions {
	return (
		typeof field === 'object' &&
		!Array.isArray(field) &&
		field !== null &&
		'field' in field &&
		typeof (field as any).field === 'string'
	)
}

/**
 * Type guard to check if a FilterField is an array of FilterFields.
 *
 * @param field - The FilterField to check.
 * @returns True if field is an array, else false.
 */
function isFilterFieldArray(field: FilterField): field is FilterField[] {
	return Array.isArray(field)
}

/**
 * Creates a search condition array based on the given field and search term.
 * Adjusts the operator based on whether the field is an enum or other specifications.
 *
 * @param field - The SearchField to create conditions for.
 * @param searchTerm - The term to search for.
 * @returns An array of search condition objects.
 *
 * @example
 * // String field
 * createSearchCondition('name', 'John')
 * // Returns: [{ name: { contains: 'John', mode: 'insensitive' } }]
 *
 * // Enum field
 * createSearchCondition({ field: 'status', operator: 'equals', isEnum: true }, 'ACTIVE')
 * // Returns: [{ status: { equals: 'ACTIVE' } }]
 *
 * // Nested fields
 * createSearchCondition({ user: { profile: 'bio' } }, 'developer')
 * // Returns: [{ user: { profile: { bio: { contains: 'developer', mode: 'insensitive' } } } }]
 *
 * // Multiple fields
 * createSearchCondition(['title', { field: 'status', operator: 'equals', isEnum: true }], 'example')
 * // Returns:
 * // [
 * //   { title: { contains: 'example', mode: 'insensitive' } },
 * //   { status: { equals: 'example' } }
 * // ]
 */
export function createSearchCondition(
	field: SearchField,
	searchTerm: string,
): any[] {
	if (typeof field === 'string') {
		const fieldParts = field.split('.')
		if (fieldParts.length > 1) {
			return [createNestedCondition(fieldParts, searchTerm)]
		} else {
			return [
				{
					[field]: {
						contains: searchTerm,
						mode: 'insensitive',
					},
				},
			]
		}
	} else if (Array.isArray(field)) {
		// Handle array of fields
		return field.flatMap(subField =>
			createSearchCondition(subField, searchTerm),
		)
	} else if (isFieldOptions(field)) {
		// Handle field object with operator and isEnum
		const { field: fieldName, operator = 'contains', isEnum, isDate } = field
		if (isEnum || operator === 'equals') {
			return [
				{
					[fieldName]: {
						equals: searchTerm,
					},
				},
			]
		} else if (isDate) {
			return [
				{
					[fieldName]: {
						[operator]: new Date(searchTerm),
					},
				},
			]
		} else {
			return [
				{
					[fieldName]: {
						[operator]: searchTerm,
						mode: 'insensitive',
					},
				},
			]
		}
	} else if (isNestedField(field)) {
		// Handle nested fields
		return [
			Object.entries(field).reduce(
				(acc, [key, value]) => {
					acc[key] = createSearchCondition(value, searchTerm)[0]
					return acc
				},
				{} as { [key: string]: any },
			),
		]
	} else {
		throw new Error('Invalid SearchField')
	}
}

/**
 * Creates a nested search condition object for dot-separated field paths.
 *
 * @param fieldParts - An array of strings representing the nested field path.
 * @param searchTerm - The term to search for.
 * @returns A nested search condition object.
 *
 * @example
 * createNestedCondition(['user', 'profile', 'bio'], 'developer')
 * // Returns:
 * // {
 * //   user: {
 * //     profile: {
 * //       bio: { contains: 'developer', mode: 'insensitive' }
 * //     }
 * //   }
 * // }
 */
function createNestedCondition(
	fieldParts: string[],
	searchTerm: string,
): { [key: string]: any } {
	if (fieldParts.length === 1) {
		return {
			[fieldParts[0]]: {
				contains: searchTerm,
				mode: 'insensitive',
			},
		}
	}
	return {
		[fieldParts[0]]: createNestedCondition(fieldParts.slice(1), searchTerm),
	}
}

/**
 * Creates exact match conditions based on the filterFields and query parameters.
 * If a filter field has a value of 'all', it will not apply any filter for that field,
 * effectively returning all values for that field.
 *
 * @param filterFields - The fields to be used for exact filtering.
 * @param url - The URL object containing query parameters.
 * @returns An object representing exact match conditions.
 *
 * @example
 * // Given filterFields = ['status', { field: 'role', operator: 'in' }]
 * // And URL has ?status=ACTIVE&status=INACTIVE&role=ADMIN
 * // Returns:
 * // {
 * //   status: { in: ['ACTIVE', 'INACTIVE'] },
 * //   role: { in: ['ADMIN'] }
 * // }
 */
function createFilterConditions(
	filterFields: Array<FilterField>,
	url: URL,
): { [key: string]: any } {
	const conditions: { [key: string]: any } = {}

	filterFields.forEach(field => {
		if (typeof field === 'string') {
			const values = url.searchParams.getAll(field)
			if (values.includes('all')) {
				// If 'all' is present, do not apply any filter for this field
				return
			}
			if (values.length === 1) {
				conditions[field] = { equals: values[0] }
			} else if (values.length > 1) {
				conditions[field] = { in: values }
			}
		} else if (isFilterFieldOptions(field)) {
			const { field: fieldName, operator = 'equals', isDate } = field
			const values = url.searchParams.getAll(fieldName)

			if (values.includes('all')) {
				// If 'all' is present, do not apply any filter for this field
				return
			}

			if (values.length === 1) {
				conditions[fieldName] = {
					[operator]: isDate ? new Date(values[0]) : values[0],
				}
			} else if (values.length > 1) {
				if (operator === 'in') {
					conditions[fieldName] = {
						in: values.map(value => (isDate ? new Date(value) : value)),
					}
				} else {
					// For operators that don't support multiple values, use OR conditions
					conditions[fieldName] = {
						OR: values.map(value => ({
							[operator]: isDate ? new Date(value) : value,
						})),
					}
				}
			}
		} else if (isFilterFieldArray(field)) {
			// Recursively handle nested filter fields
			const nestedConditions = createFilterConditions(field, url)
			Object.assign(conditions, nestedConditions)
		} else if (typeof field === 'object') {
			// Handle nested filter fields
			Object.entries(field).forEach(([key, nestedField]) => {
				const nestedConditions = createFilterConditions([nestedField], url)
				conditions[key] = nestedConditions
			})
		}
	})

	return conditions
}

/**
 * Filters and paginates data based on search parameters, exact filters, and pagination settings.
 *
 * @param params - The parameters for pagination and filtering.
 * @returns An object containing the paginated data, total pages, and current page.
 *
 * @example
 * const result = await filterAndPaginate({
 *   request,
 *   model: prisma.user,
 *   searchFields: [
 *     'name',
 *     'email',
 *     { field: 'status', operator: 'equals', isEnum: true },
 *     { user: { profile: 'bio' } },
 *   ],
 *   filterFields: [
 *     'status', // Allows multiple status values, e.g., status=ACTIVE&status=INACTIVE
 *     { field: 'role', operator: 'in' }, // Allows multiple roles, e.g., role=ADMIN&role=USER
 *   ],
 *   orderBy: [{ createdAt: 'desc' }],
 * })
 */
export async function filterAndPaginate<
	TWhereInput,
	TOrderByInput,
	TResult,
	TSelect,
	TInclude = undefined, // Ensure TInclude defaults to 'undefined'
>({
	request,
	model,
	searchFields = [] as SearchField[],
	filterFields = [] as FilterField[],
	where = {} as TWhereInput,
	orderBy = [] as TOrderByInput[],
	select,
	include, // TInclude is correctly typed
}: PaginationAndFilterParams<
	TWhereInput,
	TOrderByInput,
	TResult,
	TSelect,
	TInclude
>): Promise<{
	data: TResult[]
	totalPages: number
	currentPage: number
}> {
	const url = new URL(request.url)
	const searchTerm = url.searchParams.get('search') || ''
	const page = parseInt(url.searchParams.get('page') || '1', 10)
	const pageSizeParam = url.searchParams.get('pageSize')
	const pageSize =
		pageSizeParam === 'All' ? undefined : parseInt(pageSizeParam || '10', 10)

	// Build search conditions
	let searchConditions: SearchCondition = {}
	if (searchTerm) {
		const conditions = searchFields.flatMap(field =>
			createSearchCondition(field, searchTerm),
		)
		searchConditions = { OR: conditions }
	}

	// Build exact filter conditions
	let filterConditions: SearchCondition = {}
	if (filterFields.length > 0) {
		const exactConditions = createFilterConditions(filterFields, url)
		filterConditions = { AND: exactConditions }
	}

	// Combine all conditions
	let combinedWhere: any = {
		...where,
	}

	if (searchTerm && Object.keys(searchConditions).length > 0) {
		combinedWhere = {
			...combinedWhere,
			...searchConditions,
		}
	}

	if (filterFields.length > 0 && Object.keys(filterConditions).length > 0) {
		combinedWhere = {
			...combinedWhere,
			...filterConditions,
		}
	}

	const totalItems = await model.count({ where: combinedWhere })

	const totalPages = pageSize ? Math.ceil(totalItems / pageSize) : 1

	const data = await model.findMany({
		where: combinedWhere,
		orderBy,
		take: pageSize,
		skip: pageSize ? (page - 1) * pageSize : undefined,
		...(select ? { select } : {}),
		...(include ? { include } : {}), // Conditionally include 'include'
	})

	return {
		data,
		totalPages,
		currentPage: page,
	}
}

export { prisma }
