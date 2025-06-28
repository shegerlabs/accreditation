import {
	unstable_Control as Control,
	type FieldMetadata,
} from '@conform-to/react'
import { Checkbox } from '~/components/ui/checkbox'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table'

export function CheckboxGroupField({
	meta,
	items,
}: {
	meta: FieldMetadata<string[]>
	items: Array<{ name: string; value: string; [key: string]: any }>
}) {
	const initialValue =
		typeof meta.initialValue === 'string'
			? [meta.initialValue]
			: (meta.initialValue ?? [])

	return (
		<Table className="border-collapse border">
			<TableHeader>
				<TableRow className="border-b">
					<TableHead className="p-2">Select</TableHead>
					<TableHead className="p-2">Name</TableHead>
					{Object.keys(items[0])
						.filter(key => key !== 'name' && key !== 'value')
						.map(key => (
							<TableHead key={key} className="p-2">
								{key}
							</TableHead>
						))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{items.map(item => (
					<Control
						key={item.value}
						meta={{
							key: meta.key,
							initialValue: initialValue.find(v => v == item.value)
								? [item.value]
								: '',
						}}
						render={control => (
							<TableRow
								className="border-b"
								ref={element => {
									control.register(element?.querySelector('input'))
								}}
							>
								<TableCell className="w-5 p-2">
									<Checkbox
										type="button"
										id={`${meta.name}-${item.value}`}
										name={meta.name}
										value={item.value}
										checked={control.value == item.value}
										onCheckedChange={value =>
											control.change(value.valueOf() ? item.value : '')
										}
										onBlur={control.blur}
										className="focus:ring-2 focus:ring-stone-950 focus:ring-offset-2"
									/>
								</TableCell>
								<TableCell className="p-2">
									<label htmlFor={`${meta.name}-${item.value}`}>
										{item.name}
									</label>
								</TableCell>
								{Object.entries(item)
									.filter(([key]) => key !== 'value' && key !== 'name')
									.map(([key, value]) => (
										<TableCell key={key} className="p-2">
											{value}
										</TableCell>
									))}
							</TableRow>
						)}
					/>
				))}
			</TableBody>
		</Table>
	)
}
