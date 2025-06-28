import { useNavigate, useSearchParams } from '@remix-run/react'
import * as React from 'react'
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
} from '~/components/ui/pagination'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Icon } from './ui/icon'

type PaginationProps = {
	totalPages: number
	currentPage: number
}

export function setSearchParamsString(
	searchParams: URLSearchParams,
	changes: Record<string, string | number | undefined>,
) {
	const newSearchParams = new URLSearchParams(searchParams)

	for (const [key, value] of Object.entries(changes)) {
		if (value === undefined) {
			newSearchParams.delete(key)
			continue
		}

		newSearchParams.set(key, String(value))
	}

	return newSearchParams.toString()
}

export const Paginator: React.FC<PaginationProps> = ({
	totalPages,
	currentPage,
}) => {
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const pageNumbers = new Set<number>()

	// Always include the first page
	pageNumbers.add(1)

	// Range around the current page
	const startPage = Math.max(2, currentPage - 2)
	const endPage = Math.min(currentPage + 2, totalPages - 1)
	for (let i = startPage; i <= endPage; i++) {
		pageNumbers.add(i)
	}

	// Always include the last page
	pageNumbers.add(totalPages)

	const pagesArray = Array.from(pageNumbers).sort((a, b) => a - b) // Sort the pages for correct display order

	return (
		<Pagination className="justify-end">
			<PaginationContent>
				<PaginationItem>
					<Select
						defaultValue={searchParams.get('pageSize') || '10'}
						onValueChange={value => {
							navigate({
								search: setSearchParamsString(searchParams, {
									page: 1,
									pageSize: value,
								}),
							})
						}}
					>
						<SelectTrigger className="w-[100px]">
							<SelectValue placeholder={searchParams.get('pageSize') || '10'} />
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="10">10</SelectItem>
							<SelectItem value="20">20</SelectItem>
							<SelectItem value="50">50</SelectItem>
							<SelectItem value="100">100</SelectItem>
							<SelectItem value="All">All</SelectItem>
						</SelectContent>
					</Select>
				</PaginationItem>
				<PaginationItem>
					<PaginationLink
						to={{
							search: setSearchParamsString(searchParams, {
								page: 1,
							}),
						}}
						isActive={currentPage === 1}
						isDisabled={currentPage === 1}
					>
						<Icon name="double-arrow-left" />
					</PaginationLink>
				</PaginationItem>
				<PaginationItem>
					<PaginationLink
						to={{
							search: setSearchParamsString(searchParams, {
								page: currentPage - 1,
							}),
						}}
						isDisabled={currentPage === 1}
					>
						<Icon name="chevron-left" />
					</PaginationLink>
				</PaginationItem>

				{pagesArray.map((page, i, array) => (
					<React.Fragment key={page}>
						{/* Render an ellipsis if there's a gap in the sequence */}
						{i > 0 && page - array[i - 1] > 1 && (
							<PaginationItem>
								<PaginationEllipsis />
							</PaginationItem>
						)}
						<PaginationItem>
							<PaginationLink
								to={{
									search: setSearchParamsString(searchParams, {
										page,
									}),
								}}
								isActive={currentPage === page}
							>
								{page}
							</PaginationLink>
						</PaginationItem>
					</React.Fragment>
				))}

				<PaginationItem>
					<PaginationLink
						to={{
							search: setSearchParamsString(searchParams, {
								page: currentPage + 1,
							}),
						}}
						isDisabled={currentPage === totalPages}
					>
						<Icon name="chevron-right" />
					</PaginationLink>
				</PaginationItem>
				<PaginationItem>
					<PaginationLink
						to={{
							search: setSearchParamsString(searchParams, {
								page: totalPages,
							}),
						}}
						isActive={currentPage === totalPages}
						isDisabled={currentPage === totalPages}
					>
						<Icon name="double-arrow-right" />
					</PaginationLink>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	)
}
