import { describe, expect, it } from 'vitest'
import { hasGreenCast } from '~/utils/passport-photo'

const W = 40
const H = 50
type RGB = [number, number, number]

function image(pixel: (x: number, y: number) => RGB) {
	const data = new Uint8ClampedArray(W * H * 4)
	for (let y = 0; y < H; y++) {
		for (let x = 0; x < W; x++) {
			const [r, g, b] = pixel(x, y)
			const i = (y * W + x) * 4
			data[i] = r
			data[i + 1] = g
			data[i + 2] = b
			data[i + 3] = 255
		}
	}
	return data
}

const inFace = (x: number, y: number) =>
	x >= W * 0.2 && x < W * 0.8 && y >= H * 0.15 && y < H * 0.85

describe('hasGreenCast', () => {
	it('flags a frame whose colour planes were dropped', () => {
		// YUV with zeroed chroma: brightness kept, red and blue clipped to 0
		const data = image((x, y) => [0, 120 + ((x + y) % 100), 0])
		expect(hasGreenCast(data, W, H)).toBe(true)
	})

	it('flags a face tinted green', () => {
		const data = image(() => [90, 190, 60])
		expect(hasGreenCast(data, W, H)).toBe(true)
	})

	it('passes a normal portrait', () => {
		const data = image((x, y) =>
			inFace(x, y) ? [200, 150, 120] : [235, 235, 240],
		)
		expect(hasGreenCast(data, W, H)).toBe(false)
	})

	it('passes a face in front of a green wall', () => {
		const data = image((x, y) =>
			inFace(x, y) ? [180, 130, 100] : [40, 160, 50],
		)
		expect(hasGreenCast(data, W, H)).toBe(false)
	})

	it('passes a dark-skinned face in low light', () => {
		const data = image(() => [70, 50, 40])
		expect(hasGreenCast(data, W, H)).toBe(false)
	})
})
