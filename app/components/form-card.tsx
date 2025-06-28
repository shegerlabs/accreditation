import { Form, Link } from '@remix-run/react'
import React from 'react'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { StatusButton } from './ui/status-button'

type ButtonProps = {
	label: string
	type: 'submit' | 'button' | 'reset' | 'link'
	intent?: string
	variant?: 'default' | 'destructive' | 'outline'
	disabled?: boolean
	status?: 'idle' | 'pending' | 'success' | 'error'
	to?: string
}

type FormCardProps = {
	title?: string
	description?: string
	formId: string
	onSubmit: (event: React.FormEvent<HTMLFormElement>) => void
	buttons?: ButtonProps[]
	children: React.ReactNode
	encType?:
		| 'application/x-www-form-urlencoded'
		| 'multipart/form-data'
		| 'text/plain'
}

export function FormCard({
	title,
	description,
	formId,
	onSubmit,
	buttons,
	children,
	encType,
}: FormCardProps) {
	return (
		<Card className="mx-auto w-full">
			{title && (
				<CardHeader>
					<CardTitle className="mb-4pb-2 text-base font-semibold leading-6 text-gray-500">
						{title}
					</CardTitle>
					{description && (
						<CardDescription className="py-2">{description}</CardDescription>
					)}
				</CardHeader>
			)}
			<CardContent>
				<Form
					id={formId}
					className="space-y-4"
					method="POST"
					onSubmit={onSubmit}
					encType={encType}
					noValidate
				>
					{children}
				</Form>
			</CardContent>
			{buttons && (
				<CardFooter className="flex justify-end space-x-4 border-t py-2">
					{buttons.map((button, index) =>
						button.type === 'link' ? (
							<Button key={index} asChild variant={button.variant || 'outline'}>
								<Link to={button.to ?? ''}>{button.label}</Link>
							</Button>
						) : (
							<StatusButton
								key={index}
								type={button.type}
								form={formId}
								name="intent"
								value={button.intent}
								variant={button.variant || 'default'}
								status={button.status || 'idle'}
								disabled={button.disabled}
							>
								{button.label}
							</StatusButton>
						),
					)}
				</CardFooter>
			)}
		</Card>
	)
}
