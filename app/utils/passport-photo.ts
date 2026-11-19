// 35x45mm at 300 DPI
export const PHOTO_WIDTH = 413
export const PHOTO_HEIGHT = 531

export const GREEN_CAST_MESSAGE =
	'This photo came out with a green tint, which can happen on some phones and browsers. Please take the photo again or choose a different file.'

/**
 * True when the middle of the image, where the face sits, is mostly saturated
 * green. Some GPU drivers drop the colour channels of a YUV frame while
 * decoding or drawing it, which keeps the brightness but turns the picture
 * green. A face is never green, so a real photo against a green wall passes.
 */
export function hasGreenCast(
	data: Uint8ClampedArray,
	width: number,
	height: number,
): boolean {
	const x0 = Math.floor(width * 0.25)
	const x1 = Math.ceil(width * 0.75)
	const y0 = Math.floor(height * 0.2)
	const y1 = Math.ceil(height * 0.8)

	let sampled = 0
	let green = 0
	for (let y = y0; y < y1; y += 2) {
		for (let x = x0; x < x1; x += 2) {
			const i = (y * width + x) * 4
			const r = data[i]!
			const g = data[i + 1]!
			const b = data[i + 2]!
			sampled++
			if (g - Math.max(r, b) > 50) green++
		}
	}
	return sampled > 0 && green / sampled > 0.6
}

/**
 * Centre-crops `source` to 35x45mm and encodes it as a JPEG. Throws
 * GREEN_CAST_MESSAGE if the result is green.
 *
 * `willReadFrequently` keeps the canvas on the CPU, away from the
 * GPU paths that produce green images.
 */
export async function encodePassportPhoto(
	source: CanvasImageSource,
	sourceWidth: number,
	sourceHeight: number,
	fileName: string,
): Promise<File> {
	const canvas = document.createElement('canvas')
	canvas.width = PHOTO_WIDTH
	canvas.height = PHOTO_HEIGHT
	const ctx = canvas.getContext('2d', { willReadFrequently: true })
	if (!ctx) throw new Error('Could not get canvas context')

	const targetAspect = PHOTO_WIDTH / PHOTO_HEIGHT
	let sx = 0
	let sy = 0
	let sw = sourceWidth
	let sh = sourceHeight
	if (sourceWidth / sourceHeight > targetAspect) {
		sw = sourceHeight * targetAspect
		sx = (sourceWidth - sw) / 2
	} else {
		sh = sourceWidth / targetAspect
		sy = (sourceHeight - sh) / 2
	}
	ctx.drawImage(source, sx, sy, sw, sh, 0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)

	const { data } = ctx.getImageData(0, 0, PHOTO_WIDTH, PHOTO_HEIGHT)
	if (hasGreenCast(data, PHOTO_WIDTH, PHOTO_HEIGHT)) {
		throw new Error(GREEN_CAST_MESSAGE)
	}

	const blob = await new Promise<Blob | null>(resolve =>
		canvas.toBlob(resolve, 'image/jpeg', 0.9),
	)
	if (!blob) throw new Error('Failed to create blob from canvas')

	return new File([blob], fileName.replace(/\.[^/.]+$/, '') + '.jpg', {
		type: 'image/jpeg',
		lastModified: Date.now(),
	})
}

function loadImage(file: File): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader()
		reader.onerror = () =>
			reject(
				new Error(
					`Failed to read file: ${reader.error?.message || 'Unknown error'}`,
				),
			)
		reader.onload = () => {
			const img = new Image()
			img.onload = () => resolve(img)
			img.onerror = () =>
				reject(
					new Error(
						`Failed to load image. File type: ${file.type}, Size: ${file.size} bytes`,
					),
				)
			img.src = reader.result as string
		}
		reader.readAsDataURL(file)
	})
}

export async function cropFileToPassportPhoto(file: File): Promise<File> {
	if (!file.type.startsWith('image/')) {
		throw new Error(`Invalid file type: ${file.type}. Expected an image file.`)
	}
	if (file.size === 0) throw new Error('File is empty')

	const img = await loadImage(file)
	if (img.naturalWidth === 0 || img.naturalHeight === 0) {
		throw new Error('Invalid image dimensions')
	}
	return encodePassportPhoto(
		img,
		img.naturalWidth,
		img.naturalHeight,
		file.name,
	)
}
