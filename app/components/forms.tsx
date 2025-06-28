export type ListOfErrors = Array<string | null | undefined> | null | undefined

export function ErrorList({
	id,
	errors,
}: {
	errors?: ListOfErrors
	id?: string
}) {
	const errorsToRender = errors?.filter(Boolean)
	if (!errorsToRender?.length) return null
	return (
		<ul id={id} className="flex flex-col gap-1">
			{errorsToRender.map(e => (
				<li key={e} className="text-[14px] text-red-500">
					{e}
				</li>
			))}
		</ul>
	)
}

export const Field = ({ children }: { children: React.ReactNode }) => {
	return <div className="flex flex-col gap-2">{children}</div>
}

export const FieldError = ({ children }: { children: React.ReactNode }) => {
	return <div className="text-sm text-red-600">{children}</div>
}
