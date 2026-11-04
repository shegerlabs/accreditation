import { FieldMetadata, getInputProps } from '@conform-to/react'
import { Camera, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'

export const CameraFileInputField = ({
	meta,
	accept,
	...props
}: {
	meta: FieldMetadata<File | undefined>
	accept?: string
} & React.ComponentProps<typeof Input>) => {
	const [showCamera, setShowCamera] = useState(false)
	const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user')
	const [isCameraReady, setIsCameraReady] = useState(false)
	const videoRef = useRef<HTMLVideoElement>(null)
	const streamRef = useRef<MediaStream | null>(null)
	const fileInputRef = useRef<HTMLInputElement>(null)
	const { key, ...restProps } = props

	const startCamera = async () => {
		try {
			setIsCameraReady(false)
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: cameraFacingMode,
					width: { ideal: 1280 },
					height: { ideal: 720 },
				},
			})
			streamRef.current = stream
			if (videoRef.current) {
				videoRef.current.srcObject = stream
				// Wait for video to be ready
				videoRef.current.onloadedmetadata = () => {
					setIsCameraReady(true)
				}
			}
		} catch (error) {
			console.error('Error accessing camera:', error)
			alert('Unable to access camera. Please check permissions.')
			setIsCameraReady(false)
		}
	}

	const stopCamera = () => {
		if (streamRef.current) {
			streamRef.current.getTracks().forEach(track => track.stop())
			streamRef.current = null
		}
		if (videoRef.current) {
			videoRef.current.srcObject = null
			videoRef.current.onloadedmetadata = null
		}
		setIsCameraReady(false)
	}

	const capturePhoto = () => {
		if (!videoRef.current) return

		// Target dimensions: 35x45mm at 300 DPI = 413x531 pixels
		const targetWidth = 413
		const targetHeight = 531
		const videoWidth = videoRef.current.videoWidth
		const videoHeight = videoRef.current.videoHeight

		const canvas = document.createElement('canvas')
		canvas.width = targetWidth
		canvas.height = targetHeight
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		// Calculate crop to maintain 35x45mm aspect ratio (0.778)
		const targetAspect = targetWidth / targetHeight // 0.778
		const sourceAspect = videoWidth / videoHeight

		let sx = 0
		let sy = 0
		let sw = videoWidth
		let sh = videoHeight

		if (sourceAspect > targetAspect) {
			// Video is wider, crop horizontally (center crop)
			sw = videoHeight * targetAspect
			sx = (videoWidth - sw) / 2
		} else {
			// Video is taller, crop vertically (center crop)
			sh = videoWidth / targetAspect
			sy = (videoHeight - sh) / 2
		}

		// Draw cropped and scaled image to exact 35x45mm dimensions
		ctx.drawImage(videoRef.current, sx, sy, sw, sh, 0, 0, targetWidth, targetHeight)

		canvas.toBlob(
			blob => {
				if (blob && fileInputRef.current) {
					const file = new File([blob], `photo-${Date.now()}.jpg`, {
						type: 'image/jpeg',
					})
					// Set the file in the form input
					const dataTransfer = new DataTransfer()
					dataTransfer.items.add(file)
					fileInputRef.current.files = dataTransfer.files
					// Trigger change event for Conform
					const event = new Event('change', { bubbles: true })
					fileInputRef.current.dispatchEvent(event)
					stopCamera()
					setShowCamera(false)
				}
			},
			'image/jpeg',
			0.9,
		)
	}

	const switchCamera = async () => {
		stopCamera()
		const newMode = cameraFacingMode === 'user' ? 'environment' : 'user'
		setCameraFacingMode(newMode)
		setIsCameraReady(false)
		// Start camera with new mode
		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: {
					facingMode: newMode,
					width: { ideal: 1280 },
					height: { ideal: 720 },
				},
			})
			streamRef.current = stream
			if (videoRef.current) {
				videoRef.current.srcObject = stream
				videoRef.current.onloadedmetadata = () => {
					setIsCameraReady(true)
				}
			}
		} catch (error) {
			console.error('Error switching camera:', error)
			setIsCameraReady(false)
		}
	}

	const handleOpenCamera = () => {
		setShowCamera(true)
	}

	const handleCloseCamera = () => {
		stopCamera()
		setShowCamera(false)
	}

	// Start camera when dialog opens
	useEffect(() => {
		if (showCamera) {
			startCamera()
		}
		return () => {
			stopCamera()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [showCamera])

	const isPhotoField = accept?.includes('.jpg') || accept?.includes('.jpeg') || accept?.includes('.png')

	return (
		<>
			<div className="flex gap-2">
				<div className="flex-1">
					<Input
						ref={fileInputRef}
						{...getInputProps(meta, { type: 'file', ariaAttributes: true })}
						{...restProps}
						key={key}
						accept={accept}
					/>
				</div>
				{isPhotoField && (
					<Button
						type="button"
						variant="outline"
						onClick={handleOpenCamera}
						className="shrink-0"
					>
						<Camera className="h-4 w-4 mr-2" />
						Take Photo
					</Button>
				)}
			</div>

			<Dialog open={showCamera} onOpenChange={handleCloseCamera}>
				<DialogContent className="sm:max-w-[600px]">
					<DialogHeader>
						<DialogTitle>Take Photo</DialogTitle>
					</DialogHeader>
					<div className="space-y-4">
						<div className="relative bg-black rounded-lg overflow-hidden aspect-video">
							<video
								ref={videoRef}
								autoPlay
								playsInline
								className="w-full h-full object-cover"
							/>
							{/* 35x45mm guide overlay (aspect ratio 0.778) */}
							{isPhotoField && isCameraReady && (
								<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
									<div
										className="border-2 border-white border-dashed rounded"
										style={{
											width: '60%',
											aspectRatio: '35/45', // 35x45mm aspect ratio
											maxHeight: '80%',
										}}
									/>
								</div>
							)}
							{!isCameraReady && (
								<div className="absolute inset-0 flex items-center justify-center text-white">
									<div className="text-center">
										<Camera className="h-12 w-12 mx-auto mb-2 opacity-50" />
										<p className="text-sm">Starting camera...</p>
									</div>
								</div>
							)}
						</div>
						{isPhotoField && (
							<p className="text-xs text-muted-foreground text-center">
								Align your face within the frame (35x45mm passport photo size)
							</p>
						)}
						<div className="flex gap-2 justify-end">
							{/* Show switch camera button when multiple cameras are available */}
							{typeof navigator !== 'undefined' &&
								'mediaDevices' in navigator &&
								typeof navigator.mediaDevices.getUserMedia === 'function' && (
									<Button
										type="button"
										variant="outline"
										onClick={switchCamera}
									>
										Switch Camera
									</Button>
								)}
							<Button type="button" variant="outline" onClick={handleCloseCamera}>
								<X className="h-4 w-4 mr-2" />
								Cancel
							</Button>
							<Button type="button" onClick={capturePhoto}>
								<Camera className="h-4 w-4 mr-2" />
								Capture
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</>
	)
}

