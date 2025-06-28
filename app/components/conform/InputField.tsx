import { FieldMetadata, getInputProps } from '@conform-to/react'
import { ComponentProps } from 'react'
import { Input } from '~/components/ui/input'

export const InputField = ({
	meta,
	type,
	...props
}: {
	meta: FieldMetadata<string>
	type: Parameters<typeof getInputProps>[1]['type']
} & ComponentProps<typeof Input>) => {
	const { key, ...restProps } = props
	return (
		<Input
			{...getInputProps(meta, { type, ariaAttributes: true })}
			{...restProps}
			key={key}
		/>
	)
}
