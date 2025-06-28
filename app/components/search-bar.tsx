import { IconName } from '@/icon-name'
import { Form, Link, useSearchParams, useSubmit } from '@remix-run/react'
import { PlusCircle } from 'lucide-react'
import { useId } from 'react'
import { useMediaQuery } from 'react-responsive'
import { useDebounce, useIsPending } from '~/utils/misc'
import { Button } from './ui/button'
import { Icon } from './ui/icon'
import { Input } from './ui/input'
import { Label } from './ui/label'
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from './ui/select'
import { StatusButton } from './ui/status-button'

export function SearchBar({
	status,
	autoSubmit = false,
	action,
	filters,
	showAddButton = true,
	extras,
}: {
	status: 'idle' | 'pending' | 'success' | 'error'
	autoSubmit?: boolean
	action: string
	showAddButton?: boolean
	filters?: Array<{
		name: string
		label: string
		type: 'select' | 'input'
		options?: Array<{ value: string; label: string }>
	}>
	extras?: {
		label: string
		to: string
		icon: IconName
		type?: 'link' | 'anchor'
	}[]
}) {
	const id = useId()
	const [searchParams] = useSearchParams()
	const submit = useSubmit()
	const isSubmitting = useIsPending({
		formMethod: 'GET',
		formAction: action,
	})
	const isMobile = useMediaQuery({ maxWidth: 767 })

	const handleFormChange = useDebounce((form: HTMLFormElement) => {
		const formData = new FormData(form)
		const filteredData = new URLSearchParams()

		for (const [key, value] of formData.entries()) {
			if (typeof value === 'string' && value.trim() !== '') {
				filteredData.append(key, value)
			}
		}

		submit(filteredData, { method: 'GET', action })
	}, 400)

	return (
		<div className="flex-1">
			<Form
				method="GET"
				action={action}
				className={`flex ${isMobile ? 'flex-col' : 'flex-wrap'} items-center justify-center gap-2`}
				onChange={e => autoSubmit && handleFormChange(e.currentTarget)}
			>
				{filters && (
					<div
						className={`flex ${isMobile ? 'w-full flex-col' : 'flex-wrap'} gap-2`}
					>
						{filters.map(filter => {
							const defaultValue = searchParams.get(filter.name) || ''

							return (
								<div key={filter.name} className={isMobile ? 'w-full' : ''}>
									{filter.type === 'select' ? (
										<Select name={filter.name} defaultValue={defaultValue}>
											<SelectTrigger
												className={isMobile ? 'w-full' : 'w-[180px]'}
											>
												<SelectValue placeholder={filter.label} />
											</SelectTrigger>
											<SelectContent>
												<SelectGroup>
													<SelectLabel>{filter.label}</SelectLabel>
													{filter.options?.map(option => (
														<SelectItem key={option.value} value={option.value}>
															{option.label}
														</SelectItem>
													))}
												</SelectGroup>
											</SelectContent>
										</Select>
									) : (
										<Input
											type="text"
											name={filter.name}
											id={filter.name}
											placeholder={filter.label}
											defaultValue={defaultValue}
											className="w-full"
										/>
									)}
								</div>
							)
						})}
					</div>
				)}

				<div
					className={`flex ${isMobile ? 'w-full flex-col' : 'flex-1'} gap-2`}
				>
					<div className="flex w-full items-center gap-2">
						<div className="flex-1">
							<Label htmlFor={id} className="sr-only">
								Search
							</Label>
							<Input
								type="search"
								name="search"
								id={id}
								defaultValue={searchParams.get('search') ?? ''}
								placeholder="Search"
								className="w-full"
							/>
						</div>
						<StatusButton
							type="submit"
							status={isSubmitting ? 'pending' : status}
							className="flex items-center justify-center"
							size="sm"
						>
							<Icon name="magnifying-glass" size="sm" />
							<span className="sr-only">Search</span>
						</StatusButton>
						{showAddButton && (
							<Button asChild size="sm" className="ml-auto gap-1">
								<Link to="new">
									<PlusCircle className="h-4 w-4" />
									Add
								</Link>
							</Button>
						)}
						{extras?.map(extra => (
							<Button key={extra.label} asChild size="sm">
								{extra.type === 'anchor' ? (
									<a
										href={`${extra.to}${searchParams.size ? '?' + searchParams.toString() : ''}`}
										className="gap-1"
									>
										{extra.icon && <Icon name={extra.icon} size="sm" />}
										{extra.label}
									</a>
								) : (
									<Link to={extra.to} className="gap-1">
										{extra.icon && <Icon name={extra.icon} size="sm" />}
										{extra.label}
									</Link>
								)}
							</Button>
						))}
					</div>
				</div>
			</Form>
		</div>
	)
}
