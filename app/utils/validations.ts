import xss from 'xss'
import { z } from 'zod'

export const xssTransform = (value: string | undefined) =>
	value
		? xss(value, {
				whiteList: {},
				stripIgnoreTag: true,
				stripIgnoreTagBody: ['script', 'style', 'iframe'],
			})
		: value

export const UsernameSchema = z
	.string()
	.min(3, { message: 'Username is too short' })
	.max(100, { message: 'Username is too long' })
	.regex(/^[a-zA-Z0-9_@.-]+$/, {
		message:
			'Username can only include letters, numbers, underscores, dashes, @ and dots',
	})
	.transform(v => v.toLowerCase())
	.transform(val =>
		xss(val, {
			whiteList: {},
			stripIgnoreTag: true,
			stripIgnoreTagBody: ['script', 'style', 'iframe'],
		}),
	)

export const PasswordSchema = z
	.string({ required_error: 'Password is required' })
	.min(8, 'Password must be at least 8 characters')
	.max(100, 'Password must be at most 100 characters')
	.regex(
		/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>])[A-Za-z\d!@#$%^&*(),.?":{}|<>]{8,}$/,
		'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
	)

export const NameSchema = z
	.string()
	.min(3, { message: 'Name is too short' })
	.max(40, { message: 'Name is too long' })
	.regex(/^[a-zA-Z\s'-]+$/, {
		message: 'Name can only include letters, spaces, hyphens, and apostrophes',
	})
	.transform(v => v.trim())
	.transform(val =>
		xss(val, {
			whiteList: {},
			stripIgnoreTag: true,
			stripIgnoreTagBody: ['script', 'style', 'iframe'],
		}),
	)

export const EmailSchema = z
	.string({ required_error: 'Email is required' })
	.email({ message: 'Email is invalid' })
	.min(3, { message: 'Email is too short' })
	.max(100, { message: 'Email is too long' })
	.transform(value => value.toLowerCase())
	.transform(val =>
		xss(val, {
			whiteList: {},
			stripIgnoreTag: true,
			stripIgnoreTagBody: ['script', 'style', 'iframe'],
		}),
	)
