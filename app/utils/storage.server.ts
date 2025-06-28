import { BlobServiceClient } from '@azure/storage-blob'
import { Readable } from 'stream'

export function getBlobStorageClient() {
	const blobServiceClient = BlobServiceClient.fromConnectionString(
		process.env.AZURE_STORAGE_CONNECTION_STRING,
	)

	return blobServiceClient
}

export async function createContainer({
	name,
	metadata,
}: {
	name: string
	metadata?: {
		[key: string]: string
	}
}) {
	const blobServiceClient = getBlobStorageClient()
	const containerClient = blobServiceClient.getContainerClient(name)
	await containerClient.createIfNotExists({
		metadata: {
			...metadata,
		},
	})
}

export async function uploadFile({
	containerName,
	directory,
	fileName,
	extension,
	blob,
}: {
	containerName: string
	directory?: string
	fileName: string
	extension: string
	blob: Buffer
}) {
	const blobServiceClient = getBlobStorageClient()
	const containerClient = blobServiceClient.getContainerClient(containerName)

	await deleteFileIfExists({
		containerName,
		prefix: directory,
		fileName,
	})

	const path = directory
		? `${directory}/${fileName}.${extension}`
		: `${fileName}.${extension}`
	const blockBlobClient = containerClient.getBlockBlobClient(path)
	await blockBlobClient.deleteIfExists()
	await blockBlobClient.upload(blob, blob.length)
}

export async function deleteFile({
	containerName,
	fileName,
}: {
	containerName: string
	fileName: string
}) {
	const blobServiceClient = getBlobStorageClient()
	const containerClient = blobServiceClient.getContainerClient(containerName)
	const blockBlobClient = containerClient.getBlockBlobClient(fileName)
	await blockBlobClient.deleteIfExists()
}

export async function deleteFileIfExists({
	containerName,
	fileName,
	prefix,
}: {
	containerName: string
	fileName: string
	prefix?: string
}) {
	const blobServiceClient = getBlobStorageClient()
	const containerClient = blobServiceClient.getContainerClient(containerName)

	const blobs = await getBlobs({
		containerName,
		prefix: prefix ? `${prefix}/${fileName}` : fileName,
	})

	blobs.forEach(async blob => {
		await containerClient.deleteBlob(blob)
	})
}

export async function getBlobs({
	containerName,
	prefix,
}: {
	containerName: string
	prefix?: string
}): Promise<string[]> {
	const blobServiceClient = getBlobStorageClient()
	const containerClient = blobServiceClient.getContainerClient(containerName)
	const blobs = containerClient.listBlobsFlat({
		prefix,
	})

	const blobItems = []
	for await (const blob of blobs) {
		blobItems.push(blob)
	}

	return blobItems.map(blob => blob.name)
}

export async function getFile({
	containerName,
	fileName,
}: {
	containerName: string
	fileName: string
}): Promise<Buffer> {
	const blobServiceClient = getBlobStorageClient()
	const containerClient = blobServiceClient.getContainerClient(containerName)
	const blockBlobClient = containerClient.getBlockBlobClient(fileName)
	const downloadBlockBlobResponse = await blockBlobClient.download(0)
	let buffer: Buffer

	if (downloadBlockBlobResponse.readableStreamBody instanceof Readable) {
		// Node.js stream
		buffer = await streamToBuffer(
			downloadBlockBlobResponse.readableStreamBody as Readable,
		)
	} else if (
		downloadBlockBlobResponse.readableStreamBody instanceof ReadableStream
	) {
		// Web API stream
		const readableNode = readableWebToNode(
			downloadBlockBlobResponse.readableStreamBody as ReadableStream<Uint8Array>,
		)
		buffer = await streamToBuffer(readableNode)
	} else {
		throw new Error('No readable stream available for blob download.')
	}

	return buffer
}

function readableWebToNode(readableWeb: ReadableStream<Uint8Array>): Readable {
	const readableNode = new Readable({
		read() {},
	})

	const reader = readableWeb.getReader()
	const processText = async ({
		done,
		value,
	}: {
		done: boolean
		value?: Uint8Array
	}): Promise<void> => {
		if (done) {
			readableNode.push(null)
		} else if (value) {
			readableNode.push(Buffer.from(value))
			return reader.read().then(processText)
		}
	}

	reader
		.read()
		.then(processText)
		.catch(err => {
			readableNode.emit('error', err)
		})

	return readableNode
}

async function streamToBuffer(readableStream: Readable): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = []
		readableStream.on('data', data => {
			chunks.push(data instanceof Buffer ? data : Buffer.from(data))
		})
		readableStream.on('end', () => {
			resolve(Buffer.concat(chunks))
		})
		readableStream.on('error', reject)
	})
}

export async function deleteDirectory({
	containerName,
	directoryName,
}: {
	containerName: string
	directoryName: string
}) {
	const blobServiceClient = getBlobStorageClient()
	const containerClient = blobServiceClient.getContainerClient(containerName)

	// List all files in the directory
	const blobs = containerClient.listBlobsFlat({ prefix: directoryName })

	// Delete each file
	for await (const blob of blobs) {
		if (blob.name === directoryName) {
			continue
		}

		const blockBlobClient = containerClient.getBlockBlobClient(blob.name)
		try {
			await blockBlobClient.delete()
		} catch (error) {
			console.error(`Failed to delete blob: ${blob.name}`, error)
		}
	}

	// Attempt to delete any potential zero-byte blobs that might act as directory placeholders
	const blockBlobClient = containerClient.getBlockBlobClient(directoryName)
	try {
		await blockBlobClient.delete()
	} catch (error) {
		console.error(
			`Failed to delete directory placeholder ${directoryName}:`,
			error,
		)
	}
}
