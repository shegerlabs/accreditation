import { FieldMetadata, getInputProps } from '@conform-to/react'
import { ComponentProps } from 'react'
import { Input } from '~/components/ui/input'

export const FileInputField = ({
	meta,
	...props
}: {
	meta: FieldMetadata<File | undefined>
} & ComponentProps<typeof Input>) => {
	const { key, ...restProps } = props
	return (
		<Input
			{...getInputProps(meta, { type: 'file', ariaAttributes: true })}
			{...restProps}
			key={key}
		/>
	)
}
