import { Link } from '@remix-run/react'
import clsx from 'clsx'
import { UserIcon } from 'lucide-react'
import React from 'react'
import { ErrorList } from '~/components/forms'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader } from '~/components/ui/card'
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table'
import { Paginator } from './paginator'

type DataItem = Record<string, any>

type Column = {
	key: string
	header: string
	render?: (item: DataItem) => React.ReactNode
}

type Action = {
	label: string
	icon: React.ReactNode
	variant?:
		| 'default'
		| 'destructive'
		| 'outline'
		| 'secondary'
		| 'ghost'
		| 'link'
	href?: (item: DataItem) => string
	onClick?: (item: DataItem) => void
	render?: (item: DataItem) => React.ReactNode // Custom render function
	show?: boolean | ((item: DataItem) => boolean)
}

type DataListProps = {
	data: DataItem[]
	columns: Column[]
	actions?: Action[]
	status: 'idle' | 'error' | 'loading'
	isMobile: boolean
	keyExtractor: (item: DataItem) => string
	totalPages?: number
	currentPage?: number
	actionWidth?: string
}

export function DataList({
	data,
	columns,
	actions,
	status,
	isMobile,
	keyExtractor,
	totalPages,
	currentPage,
	actionWidth,
}: DataListProps) {
	const showPaginator = totalPages !== undefined && currentPage !== undefined

	if (status === 'loading') {
		return <div className="text-center">Loading...</div>
	}

	if (status === 'error') {
		return (
			<div className="text-center">
				<ErrorList errors={['There was an error fetching the data']} />
			</div>
		)
	}

	if (data.length === 0) {
		return (
			<div className="rounded-md border border-dashed py-8 text-center">
				<h3 className="text-base font-medium text-muted-foreground">
					No entries found
				</h3>
				<p className="mt-1 text-sm text-muted-foreground/80">
					There are no items to display at this time.
				</p>
			</div>
		)
	}

	if (isMobile) {
		return (
			<div className="space-y-4">
				{data.map(item => (
					<Card key={keyExtractor(item)} className="mb-4 overflow-hidden">
						<CardHeader className="bg-primary/10 p-2">
							<div className="flex items-center space-x-3">
								<div className="rounded-full bg-primary p-1.5">
									<UserIcon className="h-3 w-3 text-primary-foreground" />
								</div>
								<div>
									<h3 className="text-base font-semibold">
										{item[columns[0].key]}
									</h3>
								</div>
							</div>
						</CardHeader>
						<CardContent className="p-3">
							{columns.slice(1).map(column => (
								<p key={column.key} className="mb-1 text-sm">
									<strong className="font-medium">{column.header}:</strong>{' '}
									{column.render ? column.render(item) : item[column.key]}
								</p>
							))}
							{actions && (
								<div className="mt-2 flex justify-end space-x-2">
									{actions.map((action, index) => {
										if (
											action.show &&
											typeof action.show === 'function' &&
											!action.show(item)
										) {
											return null
										}

										if (
											action.show &&
											typeof action.show === 'boolean' &&
											!action.show
										) {
											return null
										}

										if (action.render) {
											return (
												<React.Fragment key={index}>
													{action.render(item)}
												</React.Fragment>
											)
										}

										if (action.href) {
											return (
												<Button
													key={index}
													asChild
													size="sm"
													variant={action.variant || 'outline'}
												>
													<Link to={action.href(item)}>
														{action.icon}
														<span className="ml-2">{action.label}</span>
													</Link>
												</Button>
											)
										}

										if (action.onClick) {
											return (
												<Button
													key={index}
													size="sm"
													variant={action.variant || 'outline'}
													onClick={() => action.onClick?.(item)}
												>
													{action.icon}
													<span className="ml-2">{action.label}</span>
												</Button>
											)
										}

										return null
									})}
								</div>
							)}
						</CardContent>
					</Card>
				))}

				{showPaginator && data?.length > 0 && (
					<div className="mt-4 border-t pt-4">
						<div className="flex items-center justify-between px-4">
							<p className="text-sm text-muted-foreground">
								Page {currentPage} of {totalPages}
							</p>
							<div className="flex space-x-2">
								<Paginator totalPages={totalPages} currentPage={currentPage} />
							</div>
						</div>
					</div>
				)}
			</div>
		)
	}

	return (
		<div className="overflow-x-auto rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						{columns.map(column => (
							<TableHead key={column.key}>{column.header}</TableHead>
						))}
						{actions && <TableHead className="text-right">Actions</TableHead>}
					</TableRow>
				</TableHeader>
				<TableBody>
					{data.map(item => (
						<TableRow key={keyExtractor(item)}>
							{columns.map(column => (
								<TableCell key={column.key} className="py-2">
									{column.render ? column.render(item) : item[column.key]}
								</TableCell>
							))}
							{actions && (
								<TableCell
									className={clsx(
										actionWidth ? `w-${actionWidth}` : 'w-48',
										'space-x-4 py-2 text-right',
									)}
								>
									{actions.map((action, index) => {
										if (
											action.show &&
											typeof action.show === 'function' &&
											!action.show(item)
										) {
											return null
										}

										if (
											action.show &&
											typeof action.show === 'boolean' &&
											!action.show
										) {
											return null
										}
										if (action.render) {
											return (
												<div key={index} className="inline-flex">
													{action.render(item)}
												</div>
											)
										}

										if (action.href) {
											return (
												<Button
													key={index}
													asChild
													size="sm"
													variant={action.variant || 'ghost'}
												>
													<Link to={action.href(item)}>{action.icon}</Link>
												</Button>
											)
										}

										if (action.onClick) {
											return (
												<Button
													key={index}
													size="sm"
													variant={action.variant || 'ghost'}
													onClick={() => action.onClick?.(item)}
												>
													{action.icon}
												</Button>
											)
										}

										return null
									})}
								</TableCell>
							)}
						</TableRow>
					))}
				</TableBody>
				{showPaginator && data?.length > 0 && (
					<TableFooter>
						<TableRow>
							<TableCell
								colSpan={columns.length + (actions ? 1 : 0)}
								className="h-8 px-4 py-1"
							>
								<div className="flex justify-end">
									<Paginator
										totalPages={totalPages}
										currentPage={currentPage}
									/>
								</div>
							</TableCell>
						</TableRow>
					</TableFooter>
				)}
			</Table>
		</div>
	)
}
