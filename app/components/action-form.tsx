import { Form } from '@remix-run/react'
import React, { ReactNode } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { StatusButton } from '~/components/ui/status-button'
import { useDoubleCheck, useIsPending } from '~/utils/misc'

type ActionFormProps = {
	method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
	action?: string
	data?: { [key: string]: any }
	buttonContent: ReactNode
	buttonVariant?:
		| 'default'
		| 'destructive'
		| 'outline'
		| 'secondary'
		| 'ghost'
		| 'link'
	buttonSize?: 'default' | 'sm' | 'lg' | 'icon' | 'xs' | null | undefined
	additionalProps?: React.HTMLAttributes<HTMLFormElement>
	intent?: string
	showContentOnDoubleCheck?: boolean
	replacementContentOnDoubleCheck?: ReactNode
}

export function ActionForm({
	method = 'POST',
	action = '',
	data = {},
	buttonContent,
	buttonVariant = 'default',
	buttonSize = 'sm',
	additionalProps = {},
	intent = 'delete',
	showContentOnDoubleCheck = true,
	replacementContentOnDoubleCheck = 'Are you sure?',
}: ActionFormProps) {
	const isPending = useIsPending()
	const dc = useDoubleCheck()

	return (
		<Form method={method} action={action} {...additionalProps}>
			<AuthenticityTokenInput />
			{Object.entries(data).map(([key, value]) => (
				<input key={key} type="hidden" name={key} value={value} />
			))}
			<StatusButton
				variant={buttonVariant}
				status={isPending ? 'pending' : 'idle'}
				size={buttonSize}
				disabled={isPending}
				{...dc.getButtonProps({
					className: 'mx-auto',
					name: 'intent',
					value: intent,
					type: 'submit',
				})}
			>
				{dc.doubleCheck ? (
					<div className="flex items-center space-x-1">
						{showContentOnDoubleCheck ? buttonContent : null}
						<span>{replacementContentOnDoubleCheck}</span>
					</div>
				) : (
					buttonContent
				)}
			</StatusButton>
		</Form>
	)
}
