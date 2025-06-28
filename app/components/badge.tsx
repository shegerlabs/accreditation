import {
	Document,
	Image,
	Page,
	PDFViewer,
	StyleSheet,
	Text,
	View,
} from '@react-pdf/renderer'
import QRCode from 'qrcode'
import React, { useEffect, useState } from 'react'

const styles = StyleSheet.create({
	page: {
		flexDirection: 'column',
		backgroundColor: '#ffffff',
	},
	header: {
		alignItems: 'center',
		marginTop: 20,
	},
	section: {
		margin: 10,
		padding: 10,
		flexGrow: 1,
		justifyContent: 'center', // Center content vertically
		alignItems: 'flex-end', // Align items to the right
	},
	background: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		width: '100%',
	},
	qrCode: {
		width: '49%',
		aspectRatio: 1,
	},
	photo: {
		width: '49%',
		aspectRatio: 1, // This ensures the photo is square
		borderRadius: 1, // Reduced from 50 to maintain square appearance
	},
	nameContainer: {
		width: '100%',
		marginTop: 10,
	},
	name: {
		fontSize: 18,
		textAlign: 'left',
	},
	organization: {
		fontSize: 18,
		textAlign: 'left',
		marginTop: 5,
	},
	closedSession: {
		fontSize: 48,
		textAlign: 'center',
		fontWeight: 'bold',
		color: 'red',
	},
	bottomSection: {
		position: 'absolute',
		bottom: 20,
		left: 10,
		right: 10,
		padding: 5,
	},
	africanUnionText: {
		fontSize: 20,
		textAlign: 'center',
		fontWeight: 'bold',
	},
})

interface BadgeProps {
	badgeInfo: {
		name: string
		organization: string
		closedSession: boolean
	}
	photoUrl: string
	frontBackgroundUrl: string
	backBackgroundUrl: string
}

export const Badge: React.FC<BadgeProps> = ({
	badgeInfo,
	photoUrl,
	frontBackgroundUrl,
	backBackgroundUrl,
}) => {
	// Step 1: Declare a state variable to track if we are on the client
	const [isClient, setIsClient] = useState(false)
	const [qrCodeDataURL, setQrCodeDataURL] = useState('')

	// Step 2: Use useEffect to detect if we are on the client
	useEffect(() => {
		// When the component mounts, we set isClient to true
		setIsClient(true)
		generateQRCode(JSON.stringify(badgeInfo))
	}, [badgeInfo])

	// Step 3: Define the document (badge) content to reuse for both rendering and download
	const generateQRCode = async (data: string) => {
		try {
			const dataURL = await QRCode.toDataURL(data, { width: 128, margin: 0 })
			setQrCodeDataURL(dataURL)
		} catch (error) {
			console.error('Error generating QR code:', error)
		}
	}

	const badgeDocument = (
		<Document title={`${badgeInfo.name}`}>
			{/* Front of the badge */}
			<Page size="A6" style={styles.page}>
				<Image src={frontBackgroundUrl} style={styles.background} />
				<View style={styles.header}>
					<Text style={styles.closedSession}>
						{badgeInfo.closedSession ? 'C' : 'O'}
					</Text>
				</View>
				<View style={styles.section}>
					<View style={styles.row}>
						{qrCodeDataURL && (
							<Image src={qrCodeDataURL} style={styles.qrCode} />
						)}
						<Image src={photoUrl} style={styles.photo} />
					</View>
					<View style={styles.nameContainer}>
						<Text style={styles.name}>Name: {badgeInfo.name}</Text>
						<Text style={styles.organization}>
							Org: {badgeInfo.organization}
						</Text>
					</View>
				</View>
				<View style={styles.bottomSection}>
					<Text style={styles.africanUnionText}>African Union</Text>
				</View>
			</Page>
			{/* Back of the badge */}
			<Page size="A6" style={styles.page}>
				<Image src={backBackgroundUrl} style={styles.background} />
				<View style={styles.section}>
					{/* Add any additional information for the back of the badge here */}
				</View>
			</Page>
		</Document>
	)

	// Step 4: Conditionally render the inline PDF viewer only if we are on the client
	if (!isClient) {
		// During SSR, this will render nothing, avoiding the mismatch
		return null
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Step 5: Render the PDF inline using PDFViewer */}
			<PDFViewer width="100%" height="600px">
				{badgeDocument}
			</PDFViewer>

			{/* Step 6: Provide a download link for the PDF using PDFDownloadLink */}
			{/* <PDFDownloadLink
				document={badgeDocument}
				fileName={`${badgeInfo.name}-${badgeInfo.organization}-badge.pdf`}
				style={{
					textDecoration: 'none',
					padding: '10px',
					color: '#ffffff',
					backgroundColor: '#4caf50',
					borderRadius: '4px',
				}}
			>
				{({ loading }) =>
					loading ? 'Generating PDF...' : 'Download Your Badge as PDF'
				}
			</PDFDownloadLink> */}
		</div>
	)
}
