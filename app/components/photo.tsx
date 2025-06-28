import * as fabric from 'fabric'
import React, { useEffect, useRef } from 'react'

const Photo: React.FC<{ link: string; altText: string }> = ({
	link,
	altText,
}) => {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const fabricCanvasRef = useRef<fabric.Canvas | null>(null) // Store the fabric canvas instance

	useEffect(() => {
		const loadImageToCanvas = async () => {
			if (canvasRef.current) {
				// Initialize fabric.Canvas and store the instance in fabricCanvasRef
				const canvas = new fabric.Canvas(canvasRef.current, {
					retinaScale: true,
				})
				fabricCanvasRef.current = canvas

				// Adjust canvas size based on your badge requirements
				canvas.setDimensions({
					width: 200,
					height: 200,
				})

				const nameText = new fabric.FabricText('Binalfew Kassa', {
					left: 50,
					top: 100,
					fontSize: 20,
					fill: '#000',
				})

				try {
					// Load the image into the canvas
					const img = await fabric.FabricImage.fromURL(link)
					img.scaleToHeight(200)
					img.scaleToWidth(200)
					img.set({
						left: 0, // Positioning inside canvas
						top: 0,
						selectable: false, // Make the image non-selectable
						evented: false, // Disable events on the image
					})
					canvas.add(img)
					canvas.add(nameText)
					canvas.renderAll()
				} catch (error) {
					console.error('Error loading image:', error)
				}
			}
		}

		loadImageToCanvas()

		// Cleanup function to dispose of the canvas when the component unmounts
		return () => {
			if (fabricCanvasRef.current) {
				fabricCanvasRef.current.dispose() // Dispose of the canvas
				fabricCanvasRef.current = null // Reset the reference
			}
		}
	}, [link])

	return <canvas ref={canvasRef} id="badgeCanvas" />
}

export default Photo
