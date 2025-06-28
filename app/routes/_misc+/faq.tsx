import { json, type LoaderFunction } from '@remix-run/node'
import { useLoaderData } from '@remix-run/react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

type FAQItem = {
	question: string
	answer: string
}

type LoaderData = {
	faqs: FAQItem[]
}

export const loader: LoaderFunction = async () => {
	const faqs: FAQItem[] = [
		{
			question: 'How do I reset my password?',
			answer:
				"To reset your password, go to the login page and click on the 'Forgot Password' link. Follow the instructions sent to your email.",
		},
		{
			question: 'Can I change my username?',
			answer:
				'Currently, usernames cannot be changed. They are permanent once an account is created.',
		},
		{
			question: 'How do I contact support?',
			answer:
				'You can contact our support team by emailing support@example.com or by using the contact form in your account settings.',
		},
		{
			question: 'Is there a mobile app available?',
			answer: 'No, we do not have mobile apps available at this time.',
		},
	]

	return json<LoaderData>({ faqs })
}

// TODO: Add a search bar to search for specific questions
export default function HelpRoute() {
	const { faqs } = useLoaderData<LoaderData>()
	const [openIndex, setOpenIndex] = useState<number | null>(null)

	const toggleFAQ = (index: number) => {
		setOpenIndex(openIndex === index ? null : index)
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Frequently Asked Questions</CardTitle>
			</CardHeader>
			<CardContent className="grid gap-4">
				{faqs.map((faq, index) => (
					<Card key={index}>
						<CardHeader className="p-4">
							<button
								className="flex w-full items-center justify-between text-left focus:outline-none"
								onClick={() => toggleFAQ(index)}
							>
								<CardTitle className="text-lg font-medium">
									{faq.question}
								</CardTitle>
								{openIndex === index ? (
									<ChevronUp className="h-5 w-5" />
								) : (
									<ChevronDown className="h-5 w-5" />
								)}
							</button>
						</CardHeader>
						{openIndex === index && (
							<CardContent className="px-4 pb-4 pt-0">
								<p>{faq.answer}</p>
							</CardContent>
						)}
					</Card>
				))}
			</CardContent>
		</Card>
	)
}
