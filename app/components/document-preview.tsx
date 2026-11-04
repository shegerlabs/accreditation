import { Download, Eye, FileIcon, RotateCw } from 'lucide-react'
import * as React from 'react'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { cn } from '~/utils/misc'

interface DocumentPreviewProps {
	title: string
	documentUrl: string
	contentType: string
	onDownload: () => void
	type: string
	icon: React.ElementType
	color: string
}

export function DocumentPreview({
	title,
	documentUrl,
	contentType,
	onDownload,
	type,
	icon: Icon,
	color,
}: DocumentPreviewProps) {
	const [isOpen, setIsOpen] = React.useState(false)
	const [key, setKey] = React.useState(0)

	const isImage = contentType.startsWith('image/')
	const isPDF = contentType === 'application/pdf'

	const previewUrl = `${documentUrl}${documentUrl.includes('?') ? '&' : '?'}mode=preview`

	const handleReload = () => {
		setKey(prev => prev + 1)
	}

	return (
		<>
			<button
				type="button"
				onClick={() => setIsOpen(true)}
				className="flex w-full items-center gap-3 rounded-lg border bg-white px-3 py-2 shadow-sm transition-colors hover:bg-slate-50"
			>
				<div
					className={cn(
						'flex h-8 w-8 items-center justify-center rounded-lg',
						color,
					)}
				>
					<Icon className="h-4 w-4 text-white" />
				</div>
				<div className="text-left">
					<p className="text-sm font-medium text-slate-700">{type}</p>
					<p className="text-xs text-slate-500">Click to preview</p>
				</div>
			</button>

			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent
					className={cn(
						'flex h-[90vh] max-h-[90vh] max-w-5xl flex-col gap-0 rounded-lg p-0',
					)}
				>
					<DialogHeader className="relative border-b px-6 py-4">
						<DialogTitle className="text-xl">{title}</DialogTitle>
						<div className="flex items-center justify-between">
							<DialogDescription className="text-sm text-gray-500">
								Preview of {type.toLowerCase()} document
							</DialogDescription>
							<div className="flex items-center gap-2">
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 rounded-full hover:bg-gray-100"
									onClick={handleReload}
								>
									<RotateCw className="h-4 w-4" />
									<span className="sr-only">Reload</span>
								</Button>
								<Button
									variant="ghost"
									size="icon"
									className="h-8 w-8 rounded-full hover:bg-gray-100"
									onClick={onDownload}
								>
									<Download className="h-4 w-4" />
									<span className="sr-only">Download</span>
								</Button>
							</div>
						</div>
					</DialogHeader>
					<div className="relative flex-1 overflow-hidden bg-gray-50/50 p-6">
						{isImage ? (
							<div className="flex h-full items-center justify-center overflow-auto rounded-lg bg-white/50 p-4 shadow-sm">
								<img
									key={key}
									src={previewUrl}
									alt={title}
									className="max-h-full max-w-full rounded-lg object-contain"
								/>
							</div>
						) : isPDF ? (
							<div className="h-full overflow-hidden rounded-lg bg-white shadow-sm">
								<iframe
									key={key}
									src={previewUrl}
									title={title}
									className="h-full w-full border-0"
									style={{ minHeight: 0 }}
								/>
							</div>
						) : (
							<div className="flex h-full items-center justify-center rounded-lg bg-white p-4 text-gray-500 shadow-sm">
								Unsupported file type
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}
